package br.com.fandangos.repository;

import br.com.fandangos.domain.Produto;
import br.com.fandangos.dto.ProdutoDTO;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.Query;
import java.util.List;

/** Mesmas regras do ClienteRepository: procedure e fronteira JDBC sem NULL. */
@Stateless
public class ProdutoRepository {

    /** Ordem das colunas devolvidas por fn_produto_grid. */
    public static final String[] COLUNAS_GRID =
        {"id", "sku", "nm", "cat", "pr", "est", "sit", "rep"};

    @PersistenceContext(unitName = "fandangosPU")
    private EntityManager em;

    @SuppressWarnings("unchecked")
    public List<Object[]> grid(String busca, String categoria, Short situacao,
                               boolean somenteRepor, int limite, int offset) {
        final Query q = em.createNativeQuery(
                "SELECT id, sku, nome, categoria, preco, estoque, situacao, repor, total "
              + "FROM fn_produto_grid(CAST(?1 AS TEXT), CAST(?2 AS TEXT), CAST(?3 AS TEXT), "
              + "CAST(?4 AS TEXT), CAST(?5 AS INT), CAST(?6 AS INT))");
        q.setParameter(1, texto(busca));
        q.setParameter(2, texto(categoria));
        q.setParameter(3, texto(situacao));
        q.setParameter(4, somenteRepor ? "1" : "");
        q.setParameter(5, limite);
        q.setParameter(6, offset);
        q.setHint("org.hibernate.fetchSize", 200);
        q.setHint("org.hibernate.readOnly", Boolean.TRUE);
        return q.getResultList();
    }

    public Produto porId(Long id) {
        return em.find(Produto.class, id);
    }

    /** JSON cru: [["Salgadinho",42], ...] */
    public String categorias() {
        return (String) em.createNativeQuery(
                "SELECT CAST(fn_produto_categorias() AS TEXT)").getSingleResult();
    }

    /** JSON cru com os KPIs de estoque. */
    public String kpis() {
        return (String) em.createNativeQuery(
                "SELECT CAST(fn_dashboard_produto() AS TEXT)").getSingleResult();
    }

    public Long salvar(ProdutoDTO dto) {
        final StringBuilder sql = new StringBuilder("SELECT fn_produto_salvar(");
        for (int i = 1; i <= 12; i++) {
            sql.append(i > 1 ? ", " : "").append("CAST(?").append(i).append(" AS TEXT)");
        }
        final Query q = em.createNativeQuery(sql.append(')').toString());

        q.setParameter(1, texto(dto.getId()));
        q.setParameter(2, texto(dto.getVersao()));
        q.setParameter(3, texto(dto.getSku()));
        q.setParameter(4, texto(dto.getNome()));
        q.setParameter(5, texto(dto.getCategoria()));
        q.setParameter(6, texto(dto.getUnidade()));
        q.setParameter(7, dto.getPreco() == null ? "" : dto.getPreco().toPlainString());
        q.setParameter(8, dto.getCusto() == null ? "" : dto.getCusto().toPlainString());
        q.setParameter(9, texto(dto.getPesoG()));
        q.setParameter(10, texto(dto.getEstoque()));
        q.setParameter(11, texto(dto.getEstoqueMin()));
        q.setParameter(12, texto(dto.getSituacao()));
        return ((Number) q.getSingleResult()).longValue();
    }

    public boolean excluir(Long id) {
        return em.createNativeQuery("DELETE FROM produto WHERE id = ?1")
                 .setParameter(1, id)
                 .executeUpdate() > 0;
    }

    /** Ver ClienteRepository.texto(): '' no lugar de NULL na fronteira JDBC. */
    private static String texto(Object valor) {
        return valor == null ? "" : valor.toString();
    }
}
