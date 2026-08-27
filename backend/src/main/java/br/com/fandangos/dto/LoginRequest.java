package br.com.fandangos.dto;

import javax.json.bind.annotation.JsonbProperty;

/** {"u":"admin","p":"..."} - 2 chaves, nao 2 palavras. */
public class LoginRequest {

    @JsonbProperty("u")
    private String usuario;

    @JsonbProperty("p")
    private String senha;

    public String getUsuario() { return usuario; }
    public void setUsuario(String usuario) { this.usuario = usuario; }
    public String getSenha() { return senha; }
    public void setSenha(String senha) { this.senha = senha; }
}
