package br.com.fandangos.security;

import javax.enterprise.context.RequestScoped;
import java.io.Serializable;

/** Identidade do request corrente, preenchida pelo AuthFilter. */
@RequestScoped
public class Sessao implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long usuarioId;
    private String login;
    private short perfil;

    public Long getUsuarioId() { return usuarioId; }
    public void setUsuarioId(Long usuarioId) { this.usuarioId = usuarioId; }
    public String getLogin() { return login; }
    public void setLogin(String login) { this.login = login; }
    public short getPerfil() { return perfil; }
    public void setPerfil(short perfil) { this.perfil = perfil; }

    public boolean isAdmin() {
        return perfil == 9;
    }
}
