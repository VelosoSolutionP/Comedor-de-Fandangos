package br.com.fandangos.rest;

import br.com.fandangos.dto.Erro;

import javax.ws.rs.WebApplicationException;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import javax.ws.rs.ext.ExceptionMapper;
import javax.ws.rs.ext.Provider;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Rede de seguranca: nenhum stacktrace vaza para o cliente. O detalhe vai
 * para o log do servidor com um id que o suporte usa para achar a ocorrencia.
 */
@Provider
public class FalhaGeralMapper implements ExceptionMapper<Throwable> {

    private static final Logger LOG = Logger.getLogger(FalhaGeralMapper.class.getName());

    @Override
    public Response toResponse(Throwable e) {
        if (e instanceof WebApplicationException) {
            final Response r = ((WebApplicationException) e).getResponse();
            return Response.status(r.getStatus())
                    .type(MediaType.APPLICATION_JSON)
                    .entity(new Erro("HTTP_" + r.getStatus(), e.getMessage()))
                    .build();
        }
        final String id = Long.toHexString(System.nanoTime());
        LOG.log(Level.SEVERE, "[erro " + id + "] " + e.getMessage(), e);
        return Response.serverError()
                .type(MediaType.APPLICATION_JSON)
                .entity(new Erro("ERRO_INTERNO", "falha inesperada - referencia " + id))
                .build();
    }
}
