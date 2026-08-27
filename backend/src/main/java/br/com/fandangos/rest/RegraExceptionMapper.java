package br.com.fandangos.rest;

import br.com.fandangos.dto.Erro;
import br.com.fandangos.service.RegraException;

import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import javax.ws.rs.ext.ExceptionMapper;
import javax.ws.rs.ext.Provider;

/** Erro de negocio -> JSON curto com o status HTTP correto. */
@Provider
public class RegraExceptionMapper implements ExceptionMapper<RegraException> {

    @Override
    public Response toResponse(RegraException e) {
        return Response.status(e.getStatus())
                .type(MediaType.APPLICATION_JSON)
                .entity(new Erro(e.getCodigo(), e.getMessage()))
                .build();
    }
}
