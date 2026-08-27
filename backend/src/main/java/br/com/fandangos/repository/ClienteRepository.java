package br.com.fandangos.repository;

import br.com.fandangos.domain.Cliente;
import br.com.fandangos.dto.ClienteDTO;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.Query;

import java.time.LocalDate;
import java.util.List;

/**
 * Acesso a dados de cliente.
 *
 * Leitura e escrita passam por PROCEDURE. Motivo pratico: o plano fica em
 * cache no Postgres, o total da paginacao volta na mesma varredura e o
 * ResultSet ja chega no formato que o front consome. Nada de SQL montado em
 * String na aplicacao.
 */
@Stateless
public class ClienteRepository {

    /** Ordem das colunas devolvidas por fn_cliente_grid. */
    public static final String[] COLUNAS_GRID = {"id", "nm", "doc", "uf", "tp", "sit"};

    @PersistenceContext(unitName = "fandangosPU")
    private EntityManager em;

    // ------------------------------------------------------------------ leitura

    /**
     * Uma chamada devolve pagina + total. As linhas vem como Object[]:
     * [0]=id [1]=nome [2]=documento [3]=uf [4]=tipo [5]=situacao [6]=total
     */
    @SuppressWarnings("unchecked")
    public List<Object[]> grid(String busca, String uf, Short situacao, int limite, int offset) {
        final Query q = em.createNativeQuery(
                "SELECT id, nome, documento, uf, tipo, situacao, total "
              + "FROM fn_cliente_grid(CAST(?1 AS TEXT), CAST(?2 AS TEXT), "
              + "CAST(?3 AS TEXT), CAST(?4 AS INT), CAST(?5 AS INT))");
        q.setParameter(1, texto(busca));
        q.setParameter(2, texto(uf));
        q.setParameter(3, texto(situacao));
        q.setParameter(4, limite);
        q.setParameter(5, offset);
        // fetch size casado com o maior page size aceito: 1 round-trip TCP
        q.setHint("org.hibernate.fetchSize", 200);
        q.setHint("org.hibernate.readOnly", Boolean.TRUE);
        return q.getResultList();
    }

    public Cliente porId(Long id) {
        return em.find(Cliente.class, id);
    }

    public Long idPorDocumento(String documento) {
        final List<?> r = em.createNamedQuery("Cliente.idPorDocumento")
                .setParameter("doc", documento)
                .setMaxResults(1)
                .getResultList();
        return r.isEmpty() ? null : (Long) r.get(0);
    }

    /** JSON cru da procedure de autopreenchimento. */
    public String lookup(String documento) {
        final Query q = em.createNativeQuery("SELECT CAST(fn_documento_lookup(CAST(?1 AS TEXT)) AS TEXT)");
        q.setParameter(1, documento);
        return (String) q.getSingleResult();
    }

    /** JSON cru com todos os widgets do dashboard. */
    public String dashboard(int dias) {
        final Query q = em.createNativeQuery("SELECT CAST(fn_dashboard(CAST(?1 AS INT)) AS TEXT)");
        q.setParameter(1, dias);
        return (String) q.getSingleResult();
    }

    // ------------------------------------------------------------------ escrita

    /**
     * INSERT ou UPDATE conforme dto.id. A procedure valida DV, checa versao e
     * devolve o id gravado.
     */
    public Long salvar(ClienteDTO dto) {
        final StringBuilder sql = new StringBuilder("SELECT fn_cliente_salvar(");
        for (int i = 1; i <= 18; i++) {
            sql.append(i > 1 ? ", " : "").append("CAST(?").append(i).append(" AS TEXT)");
        }
        final Query q = em.createNativeQuery(sql.append(')').toString());

        q.setParameter(1, texto(dto.getId()));
        q.setParameter(2, texto(dto.getVersao()));
        q.setParameter(3, texto(dto.getTipo()));
        q.setParameter(4, texto(dto.getDocumento()));
        q.setParameter(5, texto(dto.getNome()));
        q.setParameter(6, texto(dto.getFantasia()));
        q.setParameter(7, texto(dto.getEmail()));
        q.setParameter(8, texto(dto.getTelefone()));
        q.setParameter(9, texto(dto.getNascimento()));          // ISO yyyy-MM-dd
        q.setParameter(10, texto(dto.getSituacao()));
        q.setParameter(11, texto(dto.getCep()));
        q.setParameter(12, texto(dto.getLogradouro()));
        q.setParameter(13, texto(dto.getNumero()));
        q.setParameter(14, texto(dto.getComplemento()));
        q.setParameter(15, texto(dto.getBairro()));
        q.setParameter(16, texto(dto.getCidade()));
        q.setParameter(17, texto(dto.getUf()));
        q.setParameter(18, dto.getLimiteCredito() == null
                ? "" : dto.getLimiteCredito().toPlainString());
        return ((Number) q.getSingleResult()).longValue();
    }

    /** true se removeu. */
    public boolean excluir(Long id) {
        return em.createNativeQuery("DELETE FROM cliente WHERE id = ?1")
                 .setParameter(1, id)
                 .executeUpdate() > 0;
    }

    /** Grava o retorno da API externa na base publica local. */
    public void gravarEmpresaPublica(String cnpj, String razao, String fantasia, LocalDate abertura,
                                     String situacao, String cep, String logradouro, String numero,
                                     String bairro, String cidade, String uf, String telefone, String email) {
        final StringBuilder sql = new StringBuilder("SELECT fn_empresa_publica_gravar(");
        for (int i = 1; i <= 13; i++) {
            sql.append(i > 1 ? ", " : "").append("CAST(?").append(i).append(" AS TEXT)");
        }
        final Query q = em.createNativeQuery(sql.append(')').toString());

        q.setParameter(1, texto(cnpj));
        q.setParameter(2, texto(razao));
        q.setParameter(3, texto(fantasia));
        q.setParameter(4, texto(abertura));
        q.setParameter(5, texto(situacao));
        q.setParameter(6, texto(cep));
        q.setParameter(7, texto(logradouro));
        q.setParameter(8, texto(numero));
        q.setParameter(9, texto(bairro));
        q.setParameter(10, texto(cidade));
        q.setParameter(11, texto(uf));
        q.setParameter(12, texto(telefone));
        q.setParameter(13, texto(email));
        q.getSingleResult();
    }

    /**
     * Fronteira JDBC sem NULL.
     *
     * Native query do Hibernate nao consegue inferir o tipo de um parametro
     * nulo e estoura "could not determine data type". Em vez de espalhar
     * TypedParameterValue pelo codigo, tudo trafega como TEXT e a procedure
     * converte '' de volta para NULL (NULLIF). Um lugar so para lembrar.
     */
    private static String texto(Object valor) {
        return valor == null ? "" : valor.toString();
    }
}
