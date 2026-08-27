package br.com.fandangos.dto;

import javax.json.bind.annotation.JsonbDateFormat;
import javax.json.bind.annotation.JsonbProperty;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Payload do formulario. Chaves curtas + JSON-B omite nulos por padrao,
 * entao um PF sem endereco trafega ~120 bytes.
 */
public class ClienteDTO {

    @JsonbProperty("id")   private Long id;
    @JsonbProperty("v")    private Integer versao;
    @JsonbProperty("tp")   private String tipo;
    @JsonbProperty("doc")  private String documento;
    @JsonbProperty("nm")   private String nome;
    @JsonbProperty("fa")   private String fantasia;
    @JsonbProperty("em")   private String email;
    @JsonbProperty("tel")  private String telefone;

    @JsonbProperty("nasc")
    @JsonbDateFormat("yyyy-MM-dd")
    private LocalDate nascimento;

    @JsonbProperty("sit")  private Short situacao;
    @JsonbProperty("cep")  private String cep;
    @JsonbProperty("lgr")  private String logradouro;
    @JsonbProperty("num")  private String numero;
    @JsonbProperty("cpl")  private String complemento;
    @JsonbProperty("bai")  private String bairro;
    @JsonbProperty("cid")  private String cidade;
    @JsonbProperty("uf")   private String uf;
    @JsonbProperty("lim")  private BigDecimal limiteCredito;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Integer getVersao() { return versao; }
    public void setVersao(Integer versao) { this.versao = versao; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public String getDocumento() { return documento; }
    public void setDocumento(String documento) { this.documento = documento; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getFantasia() { return fantasia; }
    public void setFantasia(String fantasia) { this.fantasia = fantasia; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getTelefone() { return telefone; }
    public void setTelefone(String telefone) { this.telefone = telefone; }
    public LocalDate getNascimento() { return nascimento; }
    public void setNascimento(LocalDate nascimento) { this.nascimento = nascimento; }
    public Short getSituacao() { return situacao; }
    public void setSituacao(Short situacao) { this.situacao = situacao; }
    public String getCep() { return cep; }
    public void setCep(String cep) { this.cep = cep; }
    public String getLogradouro() { return logradouro; }
    public void setLogradouro(String logradouro) { this.logradouro = logradouro; }
    public String getNumero() { return numero; }
    public void setNumero(String numero) { this.numero = numero; }
    public String getComplemento() { return complemento; }
    public void setComplemento(String complemento) { this.complemento = complemento; }
    public String getBairro() { return bairro; }
    public void setBairro(String bairro) { this.bairro = bairro; }
    public String getCidade() { return cidade; }
    public void setCidade(String cidade) { this.cidade = cidade; }
    public String getUf() { return uf; }
    public void setUf(String uf) { this.uf = uf; }
    public BigDecimal getLimiteCredito() { return limiteCredito; }
    public void setLimiteCredito(BigDecimal limiteCredito) { this.limiteCredito = limiteCredito; }
}
