package br.com.fandangos.rest;

import br.com.fandangos.dto.LoginRequest;
import br.com.fandangos.dto.TokenResponse;
import br.com.fandangos.security.Secured;
import br.com.fandangos.security.Sessao;
import br.com.fandangos.service.AuthService;

import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

@Path("auth")
@Produces(MediaType.APPLICATION_JSON)
public class AuthResource {

    @Inject
    private AuthService service;

    @Inject
    private Sessao sessao;

    @POST
    @Path("login")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response login(LoginRequest req) {
        final TokenResponse t = service.autenticar(req.getUsuario(), req.getSenha());
        return Response.ok(t)
                .header("Cache-Control", "no-store")   // token nunca em cache
                .build();
    }

    /** Ping barato para o front saber se o token ainda vale (sem tocar no banco). */
    @GET
    @Path("eu")
    @Secured
    public Response eu() {
        return Response.ok("{\"lg\":\"" + sessao.getLogin() + "\",\"r\":" + sessao.getPerfil() + '}')
                .header("Cache-Control", "no-store")
                .build();
    }
}
