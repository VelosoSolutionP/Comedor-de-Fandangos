package br.com.fandangos.rest;

import br.com.fandangos.security.Secured;
import br.com.fandangos.service.DashboardService;

import javax.inject.Inject;
import javax.ws.rs.DefaultValue;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.CacheControl;
import javax.ws.rs.core.Context;
import javax.ws.rs.core.EntityTag;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Request;
import javax.ws.rs.core.Response;

@Path("dash")
@Secured
@Produces(MediaType.APPLICATION_JSON)
public class DashboardResource {

    @Inject
    private DashboardService service;

    /**
     * GET /api/dash?d=30
     *
     * Com ETag: o refresh do painel a cada 30s devolve 304 sem corpo enquanto
     * nada mudar. O gasto de rede de um dashboard aberto o dia inteiro cai
     * para os headers.
     */
    @GET
    public Response kpis(@QueryParam("d") @DefaultValue("30") int dias,
                         @Context Request request) {

        final String json = service.kpis(dias);
        final EntityTag tag = new EntityTag(service.etag(json).replace("W/", "").replace("\"", ""), true);

        final Response.ResponseBuilder naoModificado = request.evaluatePreconditions(tag);
        if (naoModificado != null) {
            return naoModificado.tag(tag).build();     // 304, corpo vazio
        }

        final CacheControl cc = new CacheControl();
        cc.setPrivate(true);
        cc.setMaxAge(30);
        cc.setMustRevalidate(true);

        return Response.ok(json, MediaType.APPLICATION_JSON).tag(tag).cacheControl(cc).build();
    }
}
