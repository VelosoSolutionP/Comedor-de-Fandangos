package br.com.fandangos.config;

import javax.ws.rs.container.ContainerRequestContext;
import javax.ws.rs.container.ContainerResponseContext;
import javax.ws.rs.container.ContainerResponseFilter;
import javax.ws.rs.ext.Provider;
import java.io.IOException;

/**
 * CORS enxuto. Em producao o nginx serve front e API na mesma origem,
 * entao isto so importa no dev (front em :8081, WildFly em :8080).
 */
@Provider
public class CorsFilter implements ContainerResponseFilter {

    @Override
    public void filter(ContainerRequestContext req, ContainerResponseContext res) throws IOException {
        res.getHeaders().putSingle("Access-Control-Allow-Origin", "*");
        res.getHeaders().putSingle("Access-Control-Allow-Headers", "origin, content-type, accept, authorization, if-none-match");
        res.getHeaders().putSingle("Access-Control-Expose-Headers", "etag");
        res.getHeaders().putSingle("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.getHeaders().putSingle("Access-Control-Max-Age", "86400");
    }
}
