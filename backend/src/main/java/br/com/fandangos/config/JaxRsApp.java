package br.com.fandangos.config;

import javax.ws.rs.ApplicationPath;
import javax.ws.rs.core.Application;

/** Ativa JAX-RS em /api sem web.xml. Scan automatico de @Path/@Provider. */
@ApplicationPath("/api")
public class JaxRsApp extends Application {
}
