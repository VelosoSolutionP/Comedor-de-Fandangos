package br.com.fandangos.rest;

import br.com.fandangos.dto.GridResponse;
import br.com.fandangos.dto.ProdutoDTO;
import br.com.fandangos.security.Secured;
import br.com.fandangos.service.ProdutoService;

import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.DELETE;
import javax.ws.rs.DefaultValue;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.CacheControl;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

@Path("produtos")
@Secured
@Produces(MediaType.APPLICATION_JSON)
public class ProdutoResource {

    @Inject
    private ProdutoService service;

    /** GET /api/produtos?q=&cat=&sit=&rep=1&pg=0&sz=20 - resposta colunar */
    @GET
    public Response listar(@QueryParam("q") String busca,
                           @QueryParam("cat") String categoria,
                           @QueryParam("sit") Short situacao,
                           @QueryParam("rep") @DefaultValue("0") String repor,
                           @QueryParam("pg") @DefaultValue("0") int pagina,
                           @QueryParam("sz") @DefaultValue("20") int tamanho) {

        final GridResponse g = service.listar(busca, categoria, situacao,
                "1".equals(repor), pagina, tamanho);

        final CacheControl cc = new CacheControl();
        cc.setPrivate(true);
        cc.setMaxAge(10);
        return Response.ok(g).cacheControl(cc).build();
    }

    /** Combo de categorias, com contagem. */
    @GET
    @Path("categorias")
    public Response categorias() {
        final CacheControl cc = new CacheControl();
        cc.setPrivate(true);
        cc.setMaxAge(60);
        return Response.ok(service.categorias(), MediaType.APPLICATION_JSON)
                .cacheControl(cc).build();
    }

    /** KPIs de estoque para o dashboard. */
    @GET
    @Path("kpis")
    public Response kpis() {
        return Response.ok(service.kpis(), MediaType.APPLICATION_JSON).build();
    }

    @GET
    @Path("{id}")
    public ProdutoDTO porId(@PathParam("id") Long id) {
        return service.porId(id);
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response criar(ProdutoDTO dto) {
        dto.setId(null);
        final Long id = service.salvar(dto);
        return Response.status(Response.Status.CREATED)
                .header("Location", "/api/produtos/" + id)
                .entity("{\"id\":" + id + '}')
                .build();
    }

    @PUT
    @Path("{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response atualizar(@PathParam("id") Long id, ProdutoDTO dto) {
        dto.setId(id);
        service.salvar(dto);
        return Response.noContent().build();
    }

    @DELETE
    @Path("{id}")
    public Response excluir(@PathParam("id") Long id) {
        service.excluir(id);
        return Response.noContent().build();
    }
}
