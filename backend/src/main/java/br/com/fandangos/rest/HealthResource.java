package br.com.fandangos.rest;

import br.com.fandangos.cache.RedisCache;

import javax.annotation.Resource;
import javax.inject.Inject;
import javax.sql.DataSource;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import java.sql.Connection;

/** Usado pelo healthcheck do Docker e pelo balanceador. Sem autenticacao. */
@Path("health")
@Produces(MediaType.APPLICATION_JSON)
public class HealthResource {

    @Resource(lookup = "java:jboss/datasources/FandangosDS")
    private DataSource ds;

    @Inject
    private RedisCache cache;

    @GET
    public Response check() {
        boolean db;
        try (Connection c = ds.getConnection()) {
            db = c.isValid(1);
        } catch (Exception e) {
            db = false;
        }
        final String corpo = "{\"up\":" + db + ",\"db\":" + db + ",\"cache\":" + cache.estatisticas() + '}';
        return Response.status(db ? 200 : 503)
                .entity(corpo)
                .header("Cache-Control", "no-store")
                .build();
    }
}
