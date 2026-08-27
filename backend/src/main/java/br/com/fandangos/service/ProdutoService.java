package br.com.fandangos.service;

import br.com.fandangos.cache.RedisCache;
import br.com.fandangos.domain.Produto;
import br.com.fandangos.dto.GridResponse;
import br.com.fandangos.dto.ProdutoDTO;
import br.com.fandangos.repository.ProdutoRepository;
import br.com.fandangos.util.Textos;

import javax.ejb.EJBException;
import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.inject.Inject;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Regras do catalogo de produtos. */
@Stateless
public class ProdutoService {

    public static final int PAGINA_MAX = 200;
    public static final int PAGINA_PADRAO = 20;

    /** Categorias mudam pouco: vale cache curto. */
    private static final int TTL_CATEGORIAS = 300;

    @Inject
    private ProdutoRepository repo;

    @Inject
    private RedisCache cache;

    // ------------------------------------------------------------------ leitura

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public GridResponse listar(String busca, String categoria, Short situacao,
                               boolean somenteRepor, int pagina, int tamanho) {
        final int sz = Math.min(Math.max(tamanho <= 0 ? PAGINA_PADRAO : tamanho, 1), PAGINA_MAX);
        final int pg = Math.max(pagina, 0);

        final List<Object[]> brutas = repo.grid(
                Textos.trimOuNulo(busca), Textos.trimOuNulo(categoria),
                situacao, somenteRepor, sz, pg * sz);

        final List<Object[]> linhas = new ArrayList<>(brutas.size());
        long total = 0L;
        for (final Object[] r : brutas) {
            linhas.add(new Object[]{r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]});
            if (total == 0L && r[8] != null) {
                total = ((Number) r[8]).longValue();
            }
        }
        return new GridResponse(ProdutoRepository.COLUNAS_GRID, linhas, total, pg, sz);
    }

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public ProdutoDTO porId(Long id) {
        final Produto p = repo.porId(id);
        if (p == null) {
            throw RegraException.naoEncontrado("produto " + id + " nao existe");
        }
        return paraDto(p);
    }

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public String categorias() {
        final String chave = "prod:cat:" + cache.versao("prod");
        final String hit = cache.get(chave);
        if (hit != null) {
            return hit;
        }
        final String json = repo.categorias();
        cache.set(chave, json, TTL_CATEGORIAS);
        return json;
    }

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public String kpis() {
        final String chave = "prod:kpi:" + cache.versao("prod");
        final String hit = cache.get(chave);
        if (hit != null) {
            return hit;
        }
        final String json = repo.kpis();
        cache.set(chave, json, 60);
        return json;
    }

    // ------------------------------------------------------------------ escrita

    public Long salvar(ProdutoDTO dto) {
        validar(dto);
        try {
            final Long id = repo.salvar(dto);
            cache.invalidar("prod");   // categorias e KPIs mudaram
            return id;
        } catch (RuntimeException e) {
            throw traduzir(e, dto);
        }
    }

    public void excluir(Long id) {
        if (!repo.excluir(id)) {
            throw RegraException.naoEncontrado("produto " + id + " nao existe");
        }
        cache.invalidar("prod");
    }

    // ------------------------------------------------------------------ validacao

    private void validar(ProdutoDTO dto) {
        dto.setSku(dto.getSku() == null ? null : dto.getSku().trim().toUpperCase());
        dto.setNome(Textos.limitar(Textos.trimOuNulo(dto.getNome()), 150));
        dto.setCategoria(Textos.limitar(Textos.trimOuNulo(dto.getCategoria()), 40));
        dto.setUnidade(dto.getUnidade() == null ? null : dto.getUnidade().trim().toUpperCase());

        if (dto.getSku() == null || !dto.getSku().matches("^[A-Z0-9-]{3,20}$")) {
            throw RegraException.invalido("SKU_INVALIDO",
                    "SKU deve ter de 3 a 20 caracteres (letras, numeros e hifen)");
        }
        if (dto.getNome() == null || dto.getNome().length() < 3) {
            throw RegraException.invalido("NOME_INVALIDO", "informe o nome do produto");
        }
        if (dto.getPreco() == null || dto.getPreco().signum() < 0) {
            throw RegraException.invalido("PRECO_INVALIDO", "preco e obrigatorio e nao pode ser negativo");
        }
        if (dto.getCusto() != null && dto.getCusto().signum() < 0) {
            throw RegraException.invalido("CUSTO_INVALIDO", "custo nao pode ser negativo");
        }
        // custo acima do preco nao e erro de digitacao necessariamente
        // (promocao, queima de estoque), entao passa - mas o front avisa.
        if (dto.getEstoque() != null && dto.getEstoque() < 0) {
            throw RegraException.invalido("ESTOQUE_INVALIDO", "estoque nao pode ser negativo");
        }
        if (dto.getEstoqueMin() != null && dto.getEstoqueMin() < 0) {
            throw RegraException.invalido("ESTOQUE_MIN_INVALIDO", "estoque minimo nao pode ser negativo");
        }
        if (dto.getPesoG() != null && dto.getPesoG() <= 0) {
            throw RegraException.invalido("PESO_INVALIDO", "peso deve ser maior que zero");
        }
        if (dto.getUnidade() != null && !dto.getUnidade().matches("^(UN|CX|FD|KG|G|L|ML|PCT)$")) {
            throw RegraException.invalido("UNIDADE_INVALIDA", "unidade de medida invalida");
        }
        if (dto.getSituacao() == null) {
            dto.setSituacao(Produto.SIT_ATIVO);
        }
        if (dto.getCusto() == null) {
            dto.setCusto(BigDecimal.ZERO);
        }
    }

    private RegraException traduzir(RuntimeException e, ProdutoDTO dto) {
        final String estado = sqlState(e);
        if (estado == null) {
            throw e;
        }
        switch (estado) {
            case "23505":
                return RegraException.conflito("SKU_DUPLICADO",
                        "ja existe produto com o SKU " + dto.getSku());
            case "23514":
                return RegraException.invalido("PRODUTO_INVALIDO",
                        "dados do produto rejeitados pelo banco");
            case "40001":
                return RegraException.conflito("VERSAO_CONFLITO",
                        "registro alterado por outro usuario - recarregue a tela");
            case "P0002":
                return RegraException.naoEncontrado("produto nao existe mais");
            default:
                throw e;
        }
    }

    /** Ver ClienteService.sqlState(): a causa vem embrulhada pelo container. */
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

    private static ProdutoDTO paraDto(Produto p) {
        final ProdutoDTO d = new ProdutoDTO();
        d.setId(p.getId());
        d.setVersao(p.getVersao());
        d.setSku(p.getSku());
        d.setNome(p.getNome());
        d.setCategoria(p.getCategoria());
        d.setUnidade(p.getUnidade());
        d.setPreco(p.getPreco());
        d.setCusto(p.getCusto());
        d.setPesoG(p.getPesoG());
        d.setEstoque(p.getEstoque());
        d.setEstoqueMin(p.getEstoqueMin());
        d.setSituacao(p.getSituacao());
        return d;
    }
}
