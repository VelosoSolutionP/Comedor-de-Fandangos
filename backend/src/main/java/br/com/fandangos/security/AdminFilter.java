package br.com.fandangos.security;

import br.com.fandangos.dto.Erro;

import javax.annotation.Priority;
import javax.inject.Inject;
import javax.ws.rs.Priorities;
import javax.ws.rs.container.ContainerRequestContext;
import javax.ws.rs.container.ContainerRequestFilter;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import javax.ws.rs.ext.Provider;

/** Roda DEPOIS do AuthFilter (prioridade AUTHORIZATION). */
@Admin
@Provider
@Priority(Priorities.AUTHORIZATION)
public class AdminFilter implements ContainerRequestFilter {

    @Inject
    private Sessao sessao;

    @Override
    public void filter(ContainerRequestContext ctx) {
        if ("OPTIONS".equals(ctx.getMethod())) {
            return;
        }
        if (!sessao.isAdmin()) {
            ctx.abortWith(Response.status(Response.Status.FORBIDDEN)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(new Erro("SEM_PERMISSAO", "requer perfil administrador"))
                    .build());
        }
    }
}
