package br.com.fandangos.rest;

import br.com.fandangos.dto.ClienteDTO;
import br.com.fandangos.dto.GridResponse;
import br.com.fandangos.security.Secured;
import br.com.fandangos.service.ClienteService;

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

@Path("clientes")
@Secured
@Produces(MediaType.APPLICATION_JSON)
public class ClienteResource {

    @Inject
    private ClienteService service;

    /**
     * GET /api/clientes?q=&uf=&sit=&pg=0&sz=20
     * Resposta colunar (ver GridResponse).
     */
    @GET
    public Response listar(@QueryParam("q") String busca,
                           @QueryParam("uf") String uf,
                           @QueryParam("sit") Short situacao,
                           @QueryParam("pg") @DefaultValue("0") int pagina,
                           @QueryParam("sz") @DefaultValue("20") int tamanho) {

        final GridResponse g = service.listar(busca, uf, situacao, pagina, tamanho);

        // O grid muda a cada cadastro: 10s de cache privado matam o duplo
        // request do voltar do navegador sem servir dado velho de verdade.
        final CacheControl cc = new CacheControl();
        cc.setPrivate(true);
        cc.setMaxAge(10);
        cc.setNoStore(false);

        return Response.ok(g).cacheControl(cc).build();
    }

    @GET
    @Path("{id}")
    public ClienteDTO porId(@PathParam("id") Long id) {
        return service.porId(id);
    }

    /** 201 + Location. Corpo so com o id: o front ja tem o resto. */
    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response criar(ClienteDTO dto) {
        dto.setId(null);
        final Long id = service.salvar(dto);
        return Response.status(Response.Status.CREATED)
                .header("Location", "/api/clientes/" + id)
                .entity("{\"id\":" + id + '}')
                .build();
    }

    @PUT
    @Path("{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response atualizar(@PathParam("id") Long id, ClienteDTO dto) {
        dto.setId(id);
        service.salvar(dto);
        return Response.noContent().build();   // 204: zero byte de corpo
    }

    @DELETE
    @Path("{id}")
    public Response excluir(@PathParam("id") Long id) {
        service.excluir(id);
        return Response.noContent().build();
    }
}
