package br.com.fandangos.service;

import br.com.fandangos.cache.RedisCache;
import br.com.fandangos.util.Documentos;

import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.inject.Inject;
import javax.json.Json;
import javax.json.JsonObject;
import javax.json.JsonReader;
import java.io.StringReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Autopreenchimento por CPF/CNPJ.
 *
 * Cascata, do mais barato para o mais caro:
 *   1. Redis          ~1 ms   (24 h de TTL - cadastro de empresa nao muda toda hora)
 *   2. Procedure      ~2 ms   (cliente ja cadastrado ou base publica local)
 *   3. API externa    ~800 ms (so CNPJ, so no miss, com timeout curto)
 *
 * O passo 3 alimenta 1 e 2, entao cada CNPJ novo paga a API uma unica vez na
 * vida da instalacao. Se a API cair, o cadastro continua funcionando manual.
 */
@Stateless
public class LookupService {

    private static final Logger LOG = Logger.getLogger(LookupService.class.getName());

    private static final int TTL_ACHOU = 86_400;   // 24 h
    private static final int TTL_NAO_ACHOU = 900;  // 15 min (evita marretar a API)

    private static final String NAO_ENCONTRADO = "{\"ok\":false,\"msg\":\"nao encontrado\"}";
    private static final String INVALIDO = "{\"ok\":false,\"msg\":\"documento invalido\"}";

    /**
     * HttpClient do JDK 11: pool de conexoes proprio, HTTP/2, sem dependencia
     * externa. Estatico porque criar um por request vaza thread de selector.
     */
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(1200))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .version(HttpClient.Version.HTTP_2)
            .build();

    @Inject
    private LookupPersistencia banco;

    @Inject
    private RedisCache cache;

    /**
     * SEM transacao: este metodo faz I/O de rede. As duas idas ao banco sao
     * delegadas ao LookupPersistencia, que abre transacao propria e curta.
     */
    @TransactionAttribute(TransactionAttributeType.NOT_SUPPORTED)
    public String consultar(String documento) {
        final String doc = Documentos.digitos(documento);
        if (!Documentos.valido(doc)) {
            return INVALIDO;
        }

        final String chave = "doc:" + doc;
        final String hit = cache.get(chave);
        if (hit != null) {
            return hit;
        }

        // 2) banco (cliente existente ou base publica)
        String json = banco.consultar(doc);
        if (achou(json)) {
            cache.set(chave, json, TTL_ACHOU);
            return json;
        }

        // 3) so CNPJ tem fonte publica consultavel
        if (doc.length() == 14 && externaHabilitada()) {
            final String externo = consultarReceita(doc);
            if (externo != null) {
                cache.set(chave, externo, TTL_ACHOU);
                return externo;
            }
        }

        cache.set(chave, NAO_ENCONTRADO, TTL_NAO_ACHOU);
        return NAO_ENCONTRADO;
    }

    // ------------------------------------------------------------------ externo

    private String consultarReceita(String cnpj) {
        try {
            final HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(baseExterna() + cnpj))
                    .timeout(Duration.ofMillis(2000))
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            final HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                return null;
            }

            final JsonObject o;
            try (JsonReader r = Json.createReader(new StringReader(res.body()))) {
                o = r.readObject();
            }

            final String razao = txt(o, "razao_social");
            if (razao == null) {
                return null;
            }
            final String fantasia = txt(o, "nome_fantasia");
            final String situacao = txt(o, "descricao_situacao_cadastral");
            final String cep = Documentos.digitos(txt(o, "cep"));
            final String lgr = txt(o, "logradouro");
            final String num = txt(o, "numero");
            final String bai = txt(o, "bairro");
            final String cid = txt(o, "municipio");
            final String uf = txt(o, "uf");
            final String tel = Documentos.digitos(txt(o, "ddd_telefone_1"));
            final String mail = txt(o, "email");
            final LocalDate abertura = data(txt(o, "data_inicio_atividade"));

            // persiste na base publica local: o proximo lookup nao sai da rede
            banco.gravarEmpresa(cnpj, razao, fantasia, abertura, situacao,
                    vazioParaNulo(cep), lgr, num, bai, cid, uf, vazioParaNulo(tel), mail);

            final StringBuilder sb = new StringBuilder(320);
            sb.append("{\"ok\":true,\"src\":\"api\",\"dup\":false,\"tipo\":\"J\"");
            campo(sb, "nome", razao);
            campo(sb, "fantasia", fantasia);
            campo(sb, "sit", situacao);
            campo(sb, "nasc", abertura == null ? null : abertura.toString());
            campo(sb, "cep", vazioParaNulo(cep));
            campo(sb, "lgr", lgr);
            campo(sb, "num", num);
            campo(sb, "bai", bai);
            campo(sb, "cid", cid);
            campo(sb, "uf", uf);
            campo(sb, "tel", vazioParaNulo(tel));
            campo(sb, "email", mail);
            sb.append('}');
            return sb.toString();

        } catch (Exception e) {
            // API externa fora do ar NAO pode derrubar o cadastro
            LOG.log(Level.WARNING, "[lookup] consulta externa falhou para " + cnpj + ": " + e.getMessage());
            return null;
        }
    }

    // ------------------------------------------------------------------ auxiliares

    /**
     * O Postgres serializa json_build_object como {"ok" : true, ...} (com
     * espacos), o Java monta sem. Le o valor da chave "ok" sem alocar.
     */
    private static boolean achou(String json) {
        if (json == null) {
            return false;
        }
        final int i = json.indexOf("\"ok\"");
        if (i < 0) {
            return false;
        }
        int p = i + 4;
        while (p < json.length() && (json.charAt(p) == ' ' || json.charAt(p) == ':')) {
            p++;
        }
        return json.startsWith("true", p);
    }

    private static String txt(JsonObject o, String campo) {
        if (!o.containsKey(campo) || o.isNull(campo)) {
            return null;
        }
        try {
            final String v = o.getString(campo, null);
            return v == null || v.trim().isEmpty() ? null : v.trim();
        } catch (ClassCastException e) {
            return String.valueOf(o.get(campo));
        }
    }

    private static LocalDate data(String iso) {
        try {
            return iso == null ? null : LocalDate.parse(iso.substring(0, 10));
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String vazioParaNulo(String s) {
        return s == null || s.isEmpty() ? null : s;
    }

    /** Escapa o minimo necessario para JSON valido (aspas, barra, controles). */
    private static void campo(StringBuilder sb, String chave, String valor) {
        if (valor == null) {
            return;
        }
        sb.append(",\"").append(chave).append("\":\"");
        for (int i = 0; i < valor.length(); i++) {
            final char c = valor.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    private static boolean externaHabilitada() {
        return !"false".equalsIgnoreCase(System.getenv("LOOKUP_EXTERNO"));
    }

    private static String baseExterna() {
        final String v = System.getenv("LOOKUP_URL");
        return v == null || v.isEmpty() ? "https://brasilapi.com.br/api/cnpj/v1/" : v;
    }
}
