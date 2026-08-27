package br.com.fandangos.service;

import javax.ejb.ApplicationException;

/**
 * Erro de negocio previsto. Carrega o status HTTP e um codigo estavel que o
 * front usa para decidir a mensagem - sem parsear texto.
 *
 * rollback=true: um erro de regra sempre desfaz a transacao.
 */
@ApplicationException(rollback = true)
public class RegraException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String codigo;
    private final int status;

    public RegraException(String codigo, String mensagem, int status) {
        super(mensagem);
        this.codigo = codigo;
        this.status = status;
    }

    public static RegraException invalido(String codigo, String mensagem) {
        return new RegraException(codigo, mensagem, 400);
    }

    public static RegraException conflito(String codigo, String mensagem) {
        return new RegraException(codigo, mensagem, 409);
    }

    public static RegraException naoEncontrado(String mensagem) {
        return new RegraException("NAO_ENCONTRADO", mensagem, 404);
    }

    public String getCodigo() {
        return codigo;
    }

    public int getStatus() {
        return status;
    }

    /** Stacktrace de erro de negocio nao serve para nada e custa caro. */
    @Override
    public synchronized Throwable fillInStackTrace() {
        return this;
    }
}
