package br.com.fandangos.dto;

import javax.json.bind.annotation.JsonbProperty;
import java.math.BigDecimal;

/** Chaves curtas, mesmo criterio do ClienteDTO. */
public class ProdutoDTO {

    @JsonbProperty("id")  private Long id;
    @JsonbProperty("v")   private Integer versao;
    @JsonbProperty("sku") private String sku;
    @JsonbProperty("nm")  private String nome;
    @JsonbProperty("cat") private String categoria;
    @JsonbProperty("un")  private String unidade;
    @JsonbProperty("pr")  private BigDecimal preco;
    @JsonbProperty("cu")  private BigDecimal custo;
    @JsonbProperty("pe")  private Integer pesoG;
    @JsonbProperty("est") private Integer estoque;
    @JsonbProperty("min") private Integer estoqueMin;
    @JsonbProperty("sit") private Short situacao;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Integer getVersao() { return versao; }
    public void setVersao(Integer versao) { this.versao = versao; }
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
}
