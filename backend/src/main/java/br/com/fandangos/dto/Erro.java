package br.com.fandangos.dto;

import javax.json.bind.annotation.JsonbProperty;

/** {"e":"documento invalido","c":"DOC_INVALIDO"} */
public class Erro {

    @JsonbProperty("e")
    private String mensagem;

    @JsonbProperty("c")
    private String codigo;

    public Erro() {
    }

    public Erro(String codigo, String mensagem) {
        this.codigo = codigo;
        this.mensagem = mensagem;
    }

    public String getMensagem() { return mensagem; }
    public void setMensagem(String mensagem) { this.mensagem = mensagem; }
    public String getCodigo() { return codigo; }
    public void setCodigo(String codigo) { this.codigo = codigo; }
}
