package br.com.fandangos.dto;

import javax.json.bind.annotation.JsonbProperty;

/** {"t":"<jwt>","n":"Fulano","r":9,"e":1700000000} */
public class TokenResponse {

    @JsonbProperty("t")
    private String token;

    @JsonbProperty("n")
    private String nome;

    @JsonbProperty("r")
    private short perfil;

    @JsonbProperty("e")
    private long expiraEm;

    public TokenResponse() {
    }

    public TokenResponse(String token, String nome, short perfil, long expiraEm) {
        this.token = token;
        this.nome = nome;
        this.perfil = perfil;
        this.expiraEm = expiraEm;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public short getPerfil() { return perfil; }
    public void setPerfil(short perfil) { this.perfil = perfil; }
    public long getExpiraEm() { return expiraEm; }
    public void setExpiraEm(long expiraEm) { this.expiraEm = expiraEm; }
}
