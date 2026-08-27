package br.com.fandangos.service;

import br.com.fandangos.cache.RedisCache;
import br.com.fandangos.domain.Usuario;
import br.com.fandangos.dto.TokenResponse;
import br.com.fandangos.repository.UsuarioRepository;
import br.com.fandangos.security.Jwt;
import br.com.fandangos.security.Senhas;

import javax.ejb.Stateless;
import javax.inject.Inject;
import java.util.logging.Logger;

/** Login. */
@Stateless
public class AuthService {

    private static final Logger LOG = Logger.getLogger(AuthService.class.getName());

    /** Janela do rate limit por login (segundos) e teto de tentativas. */
    private static final int RL_JANELA = 300;
    private static final int RL_MAX = 10;

    @Inject
    private UsuarioRepository repo;

    @Inject
    private Jwt jwt;

    @Inject
    private RedisCache cache;

    public TokenResponse autenticar(String login, String senha) {
        final String user = login == null ? "" : login.trim().toLowerCase();

        if (user.isEmpty() || senha == null || senha.isEmpty()) {
            throw new RegraException("CREDENCIAL_INVALIDA", "informe usuario e senha", 401);
        }
        if (excedeuTentativas(user)) {
            throw new RegraException("MUITAS_TENTATIVAS",
                    "muitas tentativas - aguarde alguns minutos", 429);
        }

        final Usuario u = repo.porLogin(user);

        // Mesmo com usuario inexistente rodamos o BCrypt (dummy) para o tempo
        // de resposta nao denunciar quais logins existem.
        final boolean ok = Senhas.confere(senha, u == null ? null : u.getSenhaHash());

        if (u == null || !ok) {
            if (u != null) {
                repo.registrarFalha(user);
            }
            LOG.info("[auth] falha de login para '" + user + "'");
            throw new RegraException("CREDENCIAL_INVALIDA", "usuario ou senha invalidos", 401);
        }
        if (u.bloqueado()) {
            throw new RegraException("USUARIO_BLOQUEADO",
                    "usuario bloqueado - procure o administrador", 403);
        }

        repo.registrarSucesso(u.getId());
        cache.del(chaveRl(user));

        final String token = jwt.gerar(u.getId(), u.getLogin(), u.getPerfil());
        return new TokenResponse(token, u.getNome(), u.getPerfil(), jwt.expiraEmSegundos());
    }

    /**
     * Rate limit no Redis. Se o Redis estiver fora, nao bloqueia ninguem -
     * a trava de falhas_login no banco continua valendo como segunda linha.
     */
    private boolean excedeuTentativas(String login) {
        final String chave = chaveRl(login);
        final String atual = cache.get(chave);
        final int n = atual == null ? 0 : Integer.parseInt(atual);
        if (n >= RL_MAX) {
            return true;
        }
        cache.set(chave, Integer.toString(n + 1), RL_JANELA);
        return false;
    }

    private static String chaveRl(String login) {
        return "rl:login:" + login;
    }
}
