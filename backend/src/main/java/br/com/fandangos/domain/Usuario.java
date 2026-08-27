package br.com.fandangos.domain;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.NamedQuery;
import javax.persistence.Table;
import java.io.Serializable;
import java.time.OffsetDateTime;

@Entity
@Table(name = "usuario")
@NamedQuery(name = "Usuario.porLogin",
            query = "SELECT u FROM Usuario u WHERE u.login = :login")
public class Usuario implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final short PERFIL_OPERADOR = 1;
    public static final short PERFIL_ADMIN = 9;

    /** Trava a conta apos N tentativas erradas seguidas. */
    public static final short MAX_FALHAS = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "login", nullable = false, length = 60)
    private String login;

    @Column(name = "senha_hash", nullable = false, length = 60)
    private String senhaHash;

    @Column(name = "nome", nullable = false, length = 120)
    private String nome;

    @Column(name = "perfil", nullable = false)
    private Short perfil;

    @Column(name = "ativo", nullable = false)
    private Boolean ativo;

    @Column(name = "falhas_login", nullable = false)
    private Short falhasLogin;

    @Column(name = "ultimo_acesso")
    private OffsetDateTime ultimoAcesso;

    public Long getId() { return id; }
    public String getLogin() { return login; }
    public void setLogin(String login) { this.login = login; }
    public String getSenhaHash() { return senhaHash; }
    public void setSenhaHash(String senhaHash) { this.senhaHash = senhaHash; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public Short getPerfil() { return perfil; }
    public void setPerfil(Short perfil) { this.perfil = perfil; }
    public Boolean getAtivo() { return ativo; }
    public void setAtivo(Boolean ativo) { this.ativo = ativo; }
    public Short getFalhasLogin() { return falhasLogin; }
    public void setFalhasLogin(Short falhasLogin) { this.falhasLogin = falhasLogin; }
    public OffsetDateTime getUltimoAcesso() { return ultimoAcesso; }
    public void setUltimoAcesso(OffsetDateTime ultimoAcesso) { this.ultimoAcesso = ultimoAcesso; }

    public boolean bloqueado() {
        return Boolean.FALSE.equals(ativo) || (falhasLogin != null && falhasLogin >= MAX_FALHAS);
    }
}
