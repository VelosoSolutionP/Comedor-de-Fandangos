package br.com.fandangos.domain;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.NamedQueries;
import javax.persistence.NamedQuery;
import javax.persistence.Table;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Cliente PF/PJ.
 *
 * A ESCRITA nao passa por aqui: vai pela procedure fn_cliente_salvar (1
 * round-trip, validacao de DV e lock otimista dentro do banco). Esta entidade
 * cobre leitura por id, exclusao e checagem de duplicidade.
 */
@Entity
@Table(name = "cliente")
@NamedQueries({
    @NamedQuery(name = "Cliente.porDocumento",
                query = "SELECT c FROM Cliente c WHERE c.documento = :doc"),
    @NamedQuery(name = "Cliente.idPorDocumento",
                query = "SELECT c.id FROM Cliente c WHERE c.documento = :doc")
})
public class Cliente implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String TIPO_FISICA = "F";
    public static final String TIPO_JURIDICA = "J";

    public static final short SIT_INATIVO = 0;
    public static final short SIT_ATIVO = 1;
    public static final short SIT_BLOQUEADO = 2;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tipo", nullable = false, length = 1)
    private String tipo;

    @Column(name = "documento", nullable = false, length = 14)
    private String documento;

    @Column(name = "nome", nullable = false, length = 150)
    private String nome;

    @Column(name = "fantasia", length = 150)
    private String fantasia;

    @Column(name = "email", length = 120)
    private String email;

    @Column(name = "telefone", length = 11)
    private String telefone;

    @Column(name = "nascimento")
    private LocalDate nascimento;

    @Column(name = "situacao", nullable = false)
    private Short situacao;

    @Column(name = "cep", length = 8)
    private String cep;

    @Column(name = "logradouro", length = 150)
    private String logradouro;

    @Column(name = "numero", length = 10)
    private String numero;

    @Column(name = "complemento", length = 60)
    private String complemento;

    @Column(name = "bairro", length = 80)
    private String bairro;

    @Column(name = "cidade", length = 80)
    private String cidade;

    @Column(name = "uf", length = 2)
    private String uf;

    @Column(name = "limite_credito", nullable = false, precision = 12, scale = 2)
    private BigDecimal limiteCredito;

    @Column(name = "criado_em", insertable = false, updatable = false)
    private OffsetDateTime criadoEm;

    @Column(name = "atualizado_em", insertable = false, updatable = false)
    private OffsetDateTime atualizadoEm;

    /** Nao e @Version: o controle otimista roda dentro de fn_cliente_salvar. */
    @Column(name = "versao", nullable = false)
    private Integer versao;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
    public OffsetDateTime getCriadoEm() { return criadoEm; }
    public OffsetDateTime getAtualizadoEm() { return atualizadoEm; }
    public Integer getVersao() { return versao; }
    public void setVersao(Integer versao) { this.versao = versao; }
}
