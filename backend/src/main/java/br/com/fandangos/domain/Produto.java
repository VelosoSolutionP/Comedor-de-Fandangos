package br.com.fandangos.domain;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.NamedQuery;
import javax.persistence.Table;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Produto do catalogo.
 *
 * Como no Cliente, a ESCRITA vai por fn_produto_salvar; esta entidade cobre
 * leitura por id e exclusao.
 */
@Entity
@Table(name = "produto")
@NamedQuery(name = "Produto.idPorSku",
            query = "SELECT p.id FROM Produto p WHERE p.sku = :sku")
public class Produto implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final short SIT_INATIVO = 0;
    public static final short SIT_ATIVO = 1;
    public static final short SIT_DESCONTINUADO = 2;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sku", nullable = false, length = 20)
    private String sku;

    @Column(name = "nome", nullable = false, length = 150)
    private String nome;

    @Column(name = "categoria", nullable = false, length = 40)
    private String categoria;

    @Column(name = "unidade", nullable = false, length = 6)
    private String unidade;

    @Column(name = "preco", nullable = false, precision = 12, scale = 2)
    private BigDecimal preco;

    @Column(name = "custo", nullable = false, precision = 12, scale = 2)
    private BigDecimal custo;

    @Column(name = "peso_g")
    private Integer pesoG;

    @Column(name = "estoque", nullable = false)
    private Integer estoque;

    @Column(name = "estoque_min", nullable = false)
    private Integer estoqueMin;

    @Column(name = "situacao", nullable = false)
    private Short situacao;

    @Column(name = "criado_em", insertable = false, updatable = false)
    private OffsetDateTime criadoEm;

    @Column(name = "versao", nullable = false)
    private Integer versao;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getCategoria() { return categoria; }
    public void setCategoria(String categoria) { this.categoria = categoria; }
    public String getUnidade() { return unidade; }
    public void setUnidade(String unidade) { this.unidade = unidade; }
    public BigDecimal getPreco() { return preco; }
    public void setPreco(BigDecimal preco) { this.preco = preco; }
    public BigDecimal getCusto() { return custo; }
    public void setCusto(BigDecimal custo) { this.custo = custo; }
    public Integer getPesoG() { return pesoG; }
    public void setPesoG(Integer pesoG) { this.pesoG = pesoG; }
    public Integer getEstoque() { return estoque; }
    public void setEstoque(Integer estoque) { this.estoque = estoque; }
    public Integer getEstoqueMin() { return estoqueMin; }
    public void setEstoqueMin(Integer estoqueMin) { this.estoqueMin = estoqueMin; }
    public Short getSituacao() { return situacao; }
    public void setSituacao(Short situacao) { this.situacao = situacao; }
    public OffsetDateTime getCriadoEm() { return criadoEm; }
    public Integer getVersao() { return versao; }
    public void setVersao(Integer versao) { this.versao = versao; }

    /** Precisa de reposicao. */
    public boolean repor() {
        return estoque != null && estoqueMin != null
            && estoque <= estoqueMin && situacao != null && situacao == SIT_ATIVO;
    }
}
