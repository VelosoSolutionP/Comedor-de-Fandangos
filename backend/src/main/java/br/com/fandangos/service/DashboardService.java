package br.com.fandangos.service;

import br.com.fandangos.cache.RedisCache;
import br.com.fandangos.repository.ClienteRepository;

import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.inject.Inject;

/**
 * Dashboard.
 *
 * Caminho feliz de um refresh de dashboard:
 *   navegador -> ETag bate -> 304 sem corpo          (~0 byte)
 * Se o ETag nao bater:
 *   Redis HIT -> JSON pronto                          (~1 ms, 0 query)
 * So no MISS:
 *   1 chamada a fn_dashboard() que agrega tudo        (1 round-trip)
 *
 * Todas as agregacoes vivem na procedure: nada de 5 endpoints e 5 COUNTs.
 */
@Stateless
public class DashboardService {

    /** Dados de dashboard toleram alguns segundos de atraso. */
    private static final int TTL_SEGUNDOS = 60;

    @Inject
    private ClienteRepository repo;

    @Inject
    private RedisCache cache;

    /** JSON cru, ja no formato final. */
    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public String kpis(int dias) {
        final int d = Math.min(Math.max(dias, 1), 365);
        final String chave = "dash:" + cache.versao("dash") + ":" + d;

        final String hit = cache.get(chave);
        if (hit != null) {
            return hit;
        }

        final String json = repo.dashboard(d);
        cache.set(chave, json, TTL_SEGUNDOS);
        return json;
    }

    /**
     * ETag derivado do conteudo. Barato (FNV-1a sobre a String) e estavel:
     * mesmo conteudo, mesmo ETag, mesmo apos restart do WildFly.
     */
    public String etag(String json) {
        long h = 0xcbf29ce484222325L;
        for (int i = 0; i < json.length(); i++) {
            h ^= json.charAt(i);
            h *= 0x100000001b3L;
        }
        return "W/\"" + Long.toHexString(h) + '"';
    }
}
