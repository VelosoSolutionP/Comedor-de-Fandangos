package br.com.fandangos.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;

import javax.annotation.PostConstruct;
import javax.ejb.Singleton;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.logging.Logger;

/**
 * Emissao e verificacao de JWT (HS256).
 *
 * O token carrega o minimo: sub (id), lg (login), pf (perfil). Nada de nome
 * completo ou permissoes por extenso - o token viaja em TODO request, cada
 * byte aqui e multiplicado pelo numero de chamadas.
 */
@Singleton
public class Jwt {

    private static final Logger LOG = Logger.getLogger(Jwt.class.getName());

    private static final String ISSUER = "comedores-de-fandangos";
    private static final String CLAIM_LOGIN = "lg";
    private static final String CLAIM_PERFIL = "pf";

    private SecretKey chave;
    private long validadeMs;

    @PostConstruct
    void iniciar() {
        String segredo = System.getenv("JWT_SECRET");
        if (segredo == null || segredo.getBytes(StandardCharsets.UTF_8).length < 32) {
            // HS256 exige >= 256 bits. Falhar cedo e melhor que assinar fraco.
            throw new IllegalStateException(
                "JWT_SECRET ausente ou menor que 32 bytes - defina no docker-compose/env");
        }
        this.chave = Keys.hmacShaKeyFor(segredo.getBytes(StandardCharsets.UTF_8));
        this.validadeMs = Long.parseLong(envOu("JWT_TTL_MIN", "120")) * 60_000L;
        LOG.info("[jwt] HS256, ttl " + (validadeMs / 60_000L) + "min");
    }

    /** Retorna o token assinado. */
    public String gerar(long usuarioId, String login, short perfil) {
        final long agora = System.currentTimeMillis();
        return Jwts.builder()
                .setIssuer(ISSUER)
                .setSubject(Long.toString(usuarioId))
                .claim(CLAIM_LOGIN, login)
                .claim(CLAIM_PERFIL, perfil)
                .setIssuedAt(new Date(agora))
                .setExpiration(new Date(agora + validadeMs))
                .signWith(chave, SignatureAlgorithm.HS256)
                .compact();
    }

    /** Claims validas ou null se o token for invalido/expirado/adulterado. */
    public Claims validar(String token) {
        try {
            return Jwts.parserBuilder()
                    .requireIssuer(ISSUER)
                    .setSigningKey(chave)
                    .setAllowedClockSkewSeconds(30)
                    .build()
                    .parseClaimsJws(token)
                    .getBody();
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }

    public long expiraEmSegundos() {
        return (System.currentTimeMillis() + validadeMs) / 1000L;
    }

    public static String login(Claims c) {
        return c.get(CLAIM_LOGIN, String.class);
    }

    public static short perfil(Claims c) {
        final Integer p = c.get(CLAIM_PERFIL, Integer.class);
        return p == null ? 1 : p.shortValue();
    }

    private static String envOu(String chave, String padrao) {
        final String v = System.getenv(chave);
        return v == null || v.isEmpty() ? padrao : v;
    }
}
