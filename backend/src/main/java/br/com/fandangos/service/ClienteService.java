package br.com.fandangos.service;

import br.com.fandangos.cache.RedisCache;
import br.com.fandangos.domain.Cliente;
import br.com.fandangos.dto.ClienteDTO;
import br.com.fandangos.dto.GridResponse;
import br.com.fandangos.repository.ClienteRepository;
import br.com.fandangos.util.Documentos;
import br.com.fandangos.util.Textos;

import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.inject.Inject;
import javax.ejb.EJBException;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Regras de cadastro de cliente. */
@Stateless
public class ClienteService {

    /** Teto de itens por pagina. Cliente pedir 10.000 nao e motivo para servir. */
    public static final int PAGINA_MAX = 200;
    public static final int PAGINA_PADRAO = 20;

    @Inject
    private ClienteRepository repo;

    @Inject
    private RedisCache cache;

    // ------------------------------------------------------------------ leitura

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public GridResponse listar(String busca, String uf, Short situacao, int pagina, int tamanho) {
        final int sz = Math.min(Math.max(tamanho <= 0 ? PAGINA_PADRAO : tamanho, 1), PAGINA_MAX);
        final int pg = Math.max(pagina, 0);

        final List<Object[]> brutas = repo.grid(
                Textos.trimOuNulo(busca), Textos.upper2(uf), situacao, sz, pg * sz);

        final List<Object[]> linhas = new ArrayList<>(brutas.size());
        long total = 0L;
        for (final Object[] r : brutas) {
            // descarta a coluna 'total' repetida em toda linha pela window function
            linhas.add(new Object[]{r[0], r[1], r[2], r[3], r[4], r[5]});
            if (total == 0L && r[6] != null) {
                total = ((Number) r[6]).longValue();
            }
        }
        return new GridResponse(ClienteRepository.COLUNAS_GRID, linhas, total, pg, sz);
    }

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public ClienteDTO porId(Long id) {
        final Cliente c = repo.porId(id);
        if (c == null) {
            throw RegraException.naoEncontrado("cliente " + id + " nao existe");
        }
        return paraDto(c);
    }

    // ------------------------------------------------------------------ escrita

    public Long salvar(ClienteDTO dto) {
        validar(dto);
        try {
            final Long id = repo.salvar(dto);
            cache.invalidar("dash");                    // KPIs mudaram
            cache.del("doc:" + dto.getDocumento());     // lookup daquele documento mudou
            return id;
        } catch (RuntimeException e) {
            // RuntimeException, nao PersistenceException: o ClienteRepository e
            // outro EJB, e o container embrulha excecao de sistema em
            // EJBTransactionRolledbackException ao cruzar a fronteira do bean.
            // Filtrar por PersistenceException aqui deixaria passar direto e
            // todo erro de negocio do banco viraria 500.
            throw traduzir(e, dto);
        }
    }

    public void excluir(Long id) {
        if (!repo.excluir(id)) {
            throw RegraException.naoEncontrado("cliente " + id + " nao existe");
        }
        cache.invalidar("dash");
    }

    // ------------------------------------------------------------------ validacao

    /**
     * Fail-fast em memoria antes de gastar uma conexao do pool. O banco valida
     * de novo (CHECK + procedure) porque a aplicacao nao e a unica porta.
     */
    private void validar(ClienteDTO dto) {
        dto.setDocumento(Documentos.digitos(dto.getDocumento()));
        dto.setNome(Textos.limitar(Textos.trimOuNulo(dto.getNome()), 150));
        dto.setFantasia(Textos.limitar(Textos.trimOuNulo(dto.getFantasia()), 150));
        dto.setEmail(Textos.trimOuNulo(dto.getEmail()));
        dto.setTelefone(Documentos.digitos(dto.getTelefone()));
        dto.setCep(Documentos.digitos(dto.getCep()));
        dto.setUf(Textos.upper2(dto.getUf()));

        if (dto.getNome() == null || dto.getNome().length() < 3) {
            throw RegraException.invalido("NOME_INVALIDO", "informe o nome completo");
        }
        final char tipo = Documentos.tipo(dto.getDocumento());
        if (tipo == 0) {
            throw RegraException.invalido("DOC_INVALIDO", "CPF/CNPJ invalido");
        }
        // o tipo e derivado do documento: o usuario nao consegue divergir os dois
        dto.setTipo(String.valueOf(tipo));

        if (!Textos.emailOk(dto.getEmail())) {
            throw RegraException.invalido("EMAIL_INVALIDO", "e-mail invalido");
        }
        if (dto.getTelefone() != null && !dto.getTelefone().isEmpty()
                && (dto.getTelefone().length() < 10 || dto.getTelefone().length() > 11)) {
            throw RegraException.invalido("TEL_INVALIDO", "telefone deve ter DDD + 8 ou 9 digitos");
        }
        if (dto.getCep() != null && !dto.getCep().isEmpty() && dto.getCep().length() != 8) {
            throw RegraException.invalido("CEP_INVALIDO", "CEP deve ter 8 digitos");
        }
        if (dto.getUf() != null && dto.getUf().length() != 2) {
            throw RegraException.invalido("UF_INVALIDA", "UF deve ter 2 letras");
        }
        if (dto.getLimiteCredito() != null && dto.getLimiteCredito().signum() < 0) {
            throw RegraException.invalido("LIMITE_INVALIDO", "limite de credito nao pode ser negativo");
        }
        if (dto.getSituacao() == null) {
            dto.setSituacao(Cliente.SIT_ATIVO);
        }
        if (dto.getTelefone() != null && dto.getTelefone().isEmpty()) {
            dto.setTelefone(null);
        }
        if (dto.getCep() != null && dto.getCep().isEmpty()) {
            dto.setCep(null);
        }
    }

    /** Converte SQLSTATE da procedure em erro de negocio com status HTTP certo. */
    private RegraException traduzir(RuntimeException e, ClienteDTO dto) {
        final String estado = sqlState(e);
        if (estado == null) {
            throw e;
        }
        switch (estado) {
            case "23505":  // unique_violation
                return RegraException.conflito("DOC_DUPLICADO",
                        "ja existe cliente com o documento " + Documentos.formatar(dto.getDocumento()));
            case "23514":  // check_violation (DV invalido, tipo divergente)
                return RegraException.invalido("DOC_INVALIDO", "CPF/CNPJ invalido para o tipo informado");
            case "40001":  // serialization_failure (usado como conflito de versao)
                return RegraException.conflito("VERSAO_CONFLITO",
                        "registro alterado por outro usuario - recarregue a tela");
            case "P0002":  // no_data_found
                return RegraException.naoEncontrado("cliente nao existe mais");
            default:
                throw e;
        }
    }

    /**
     * Procura o SQLSTATE na cadeia de causas.
     *
     * A cadeia real e mais funda do que parece:
     *   EJBTransactionRolledbackException
     *     -> PersistenceException
     *       -> ConstraintViolationException (Hibernate)
     *         -> PSQLException  <- o SQLSTATE esta aqui
     *
     * EJBException guarda a causa em getCausedByException(), que nem sempre
     * aparece em getCause(); por isso os dois caminhos sao percorridos.
     */
    private static String sqlState(Throwable t) {
        Throwable c = t;
        for (int nivel = 0; c != null && nivel < 12; nivel++) {
            if (c instanceof SQLException) {
                final String s = ((SQLException) c).getSQLState();
                if (s != null && !s.isEmpty()) {
                    return s;
                }
            }
            Throwable proxima = c.getCause();
            if (proxima == null && c instanceof EJBException) {
                proxima = ((EJBException) c).getCausedByException();
            }
            if (proxima == c) {
                break;
            }
            c = proxima;
        }
        return null;
    }

    private static ClienteDTO paraDto(Cliente c) {
        final ClienteDTO d = new ClienteDTO();
        d.setId(c.getId());
        d.setVersao(c.getVersao());
        d.setTipo(c.getTipo());
        d.setDocumento(c.getDocumento());
        d.setNome(c.getNome());
        d.setFantasia(c.getFantasia());
        d.setEmail(c.getEmail());
        d.setTelefone(c.getTelefone());
        d.setNascimento(c.getNascimento());
        d.setSituacao(c.getSituacao());
        d.setCep(c.getCep());
        d.setLogradouro(c.getLogradouro());
        d.setNumero(c.getNumero());
        d.setComplemento(c.getComplemento());
        d.setBairro(c.getBairro());
        d.setCidade(c.getCidade());
        d.setUf(c.getUf());
        d.setLimiteCredito(c.getLimiteCredito());
        return d;
    }
}
