package br.com.fandangos.rest;

import br.com.fandangos.security.Secured;
import br.com.fandangos.service.LookupService;

import javax.inject.Inject;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.CacheControl;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

/** Autopreenchimento do formulario por CPF/CNPJ. */
@Path("lookup")
@Secured
@Produces(MediaType.APPLICATION_JSON)
public class LookupResource {

    @Inject
    private LookupService service;

    /**
     * GET /api/lookup/{documento}
     * Devolve o JSON cru da procedure/API - sem re-serializar em DTO.
     */
    @GET
    @Path("{doc}")
    public Response consultar(@PathParam("doc") String documento) {
        final String json = service.consultar(documento);

        // 5 min no navegador: se o usuario apagar e redigitar o mesmo
        // documento, nem sai request.
        final CacheControl cc = new CacheControl();
        cc.setPrivate(true);
        cc.setMaxAge(300);

        return Response.ok(json, MediaType.APPLICATION_JSON).cacheControl(cc).build();
    }
}
