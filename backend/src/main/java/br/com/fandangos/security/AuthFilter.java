package br.com.fandangos.security;

import br.com.fandangos.dto.Erro;
import io.jsonwebtoken.Claims;

import javax.annotation.Priority;
import javax.inject.Inject;
import javax.ws.rs.Priorities;
import javax.ws.rs.container.ContainerRequestContext;
import javax.ws.rs.container.ContainerRequestFilter;
import javax.ws.rs.core.HttpHeaders;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import javax.ws.rs.ext.Provider;

/**
 * Guarda de entrada dos recursos @Secured.
 *
 * Custo por request: 1 verificacao HMAC em memoria. Zero ida ao banco, zero
 * ida ao Redis - e por isso que a sessao vive no token e nao no servidor.
 */
@Secured
@Provider
@Priority(Priorities.AUTHENTICATION)
public class AuthFilter implements ContainerRequestFilter {

    private static final String PREFIXO = "Bearer ";

    @Inject
    private Jwt jwt;

    @Inject
    private Sessao sessao;

    @Override
    public void filter(ContainerRequestContext ctx) {
        // preflight nao carrega Authorization
        if ("OPTIONS".equals(ctx.getMethod())) {
            return;
        }

        final String header = ctx.getHeaderString(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(PREFIXO)) {
            recusar(ctx, "SEM_TOKEN", "credencial ausente");
            return;
        }

        final Claims claims = jwt.validar(header.substring(PREFIXO.length()).trim());
        if (claims == null) {
            recusar(ctx, "TOKEN_INVALIDO", "sessao expirada ou token invalido");
            return;
        }

        sessao.setUsuarioId(Long.valueOf(claims.getSubject()));
        sessao.setLogin(Jwt.login(claims));
        sessao.setPerfil(Jwt.perfil(claims));
    }

    private static void recusar(ContainerRequestContext ctx, String codigo, String msg) {
        ctx.abortWith(Response.status(Response.Status.UNAUTHORIZED)
                .type(MediaType.APPLICATION_JSON)
                .entity(new Erro(codigo, msg))
                .build());
    }
}
