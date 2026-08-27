package br.com.fandangos.cache;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import javax.ejb.ConcurrencyManagement;
import javax.ejb.ConcurrencyManagementType;
import javax.ejb.Singleton;
import javax.ejb.Startup;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Cache Redis com duas garantias inegociaveis:
 *
 * 1) NUNCA derruba o request. Redis fora do ar = MISS, e o request segue no
 *    banco. Um circuit breaker curto evita pagar o timeout de conexao em todo
 *    request enquanto o Redis nao volta.
 *
 * 2) Invalidacao SEM comando KEYS/SCAN. Cada namespace tem um contador de
 *    versao; invalidar = INCR nesse contador. As chaves antigas viram lixo e
 *    expiram sozinhas pelo TTL. Custo O(1) em vez de O(n) sobre o keyspace.
 */
@Singleton
@Startup
@ConcurrencyManagement(ConcurrencyManagementType.BEAN)
public class RedisCache {

    private static final Logger LOG = Logger.getLogger(RedisCache.class.getName());

    /** Quanto tempo o breaker fica aberto depois de uma falha. */
    private static final long BREAKER_MS = 15_000L;

    private JedisPool pool;
    private volatile boolean habilitado;
    private final AtomicLong breakerAte = new AtomicLong(0L);

    private final AtomicLong hits = new AtomicLong();
    private final AtomicLong misses = new AtomicLong();

    @PostConstruct
    void iniciar() {
        final String host = env("REDIS_HOST", "redis");
        final int port = Integer.parseInt(env("REDIS_PORT", "6379"));
        this.habilitado = Boolean.parseBoolean(env("REDIS_ENABLED", "true"));

        if (!habilitado) {
            LOG.info("[cache] desabilitado por REDIS_ENABLED=false");
            return;
        }

        final JedisPoolConfig cfg = new JedisPoolConfig();
        cfg.setMaxTotal(Integer.parseInt(env("REDIS_POOL_MAX", "32")));
        cfg.setMaxIdle(8);
        cfg.setMinIdle(2);
        cfg.setTestOnBorrow(false);              // ping por request custa RTT
        cfg.setTestWhileIdle(true);              // valida em background
        cfg.setBlockWhenExhausted(true);
        cfg.setMaxWaitMillis(150L);              // prefere MISS a fila de espera

        // timeout unico (conexao e leitura). Curto de proposito: e melhor
        // devolver MISS em 300ms do que segurar o request esperando o cache.
        this.pool = new JedisPool(cfg, host, port, 300);
        LOG.info("[cache] redis " + host + ":" + port);
    }

    @PreDestroy
    void parar() {
        if (pool != null) {
            pool.close();
        }
    }

    // ------------------------------------------------------------------ API

    /** Valor cru (JSON pronto) ou null em miss / Redis indisponivel. */
    public String get(String chave) {
        if (!aberto()) {
            return null;
        }
        try (Jedis j = pool.getResource()) {
            final String v = j.get(chave);
            if (v == null) {
                misses.incrementAndGet();
            } else {
                hits.incrementAndGet();
            }
            return v;
        } catch (RuntimeException e) {
            falhou(e);
            return null;
        }
    }

    public void set(String chave, String valor, int ttlSegundos) {
        if (!aberto() || valor == null) {
            return;
        }
        try (Jedis j = pool.getResource()) {
            j.setex(chave, ttlSegundos, valor);
        } catch (RuntimeException e) {
            falhou(e);
        }
    }

    public void del(String chave) {
        if (!aberto()) {
            return;
        }
        try (Jedis j = pool.getResource()) {
            j.del(chave);
        } catch (RuntimeException e) {
            falhou(e);
        }
    }

    /**
     * Versao corrente de um namespace. Entra na composicao da chave, entao
     * um INCR invalida tudo daquele namespace de uma vez, em O(1).
     */
    public long versao(String namespace) {
        if (!aberto()) {
            return 0L;
        }
        try (Jedis j = pool.getResource()) {
            final String v = j.get("ver:" + namespace);
            return v == null ? 0L : Long.parseLong(v);
        } catch (RuntimeException e) {
            falhou(e);
            return 0L;
        }
    }

    /** Invalida o namespace inteiro sem varrer o keyspace. */
    public void invalidar(String namespace) {
        if (!aberto()) {
            return;
        }
        try (Jedis j = pool.getResource()) {
            j.incr("ver:" + namespace);
        } catch (RuntimeException e) {
            falhou(e);
        }
    }

    /** hits/misses para o endpoint /api/health. */
    public String estatisticas() {
        final long h = hits.get();
        final long m = misses.get();
        final long tot = h + m;
        final long taxa = tot == 0 ? 0 : (h * 100 / tot);
        return "{\"on\":" + aberto() + ",\"h\":" + h + ",\"m\":" + m + ",\"hit\":" + taxa + "}";
    }

    // -------------------------------------------------------------- interno

    private boolean aberto() {
        return habilitado && pool != null && System.currentTimeMillis() >= breakerAte.get();
    }

    private void falhou(RuntimeException e) {
        breakerAte.set(System.currentTimeMillis() + BREAKER_MS);
        LOG.log(Level.WARNING, "[cache] indisponivel por " + (BREAKER_MS / 1000) + "s: " + e.getMessage());
    }

    private static String env(String chave, String padrao) {
        final String v = System.getenv(chave);
        return v == null || v.isEmpty() ? padrao : v;
    }
}
