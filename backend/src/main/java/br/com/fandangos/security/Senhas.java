package br.com.fandangos.security;

import org.mindrot.jbcrypt.BCrypt;

/**
 * BCrypt.
 *
 * Custo 10 = ~60ms por verificacao em hardware de 2024. E lento DE PROPOSITO:
 * e o unico ponto do sistema onde lentidao e feature. Nao baixe isso para
 * "melhorar performance do login".
 */
public final class Senhas {

    private static final int CUSTO = 10;

    /**
     * Hash descartavel usado quando o login nao existe. Comparar contra ele
     * faz o tempo de resposta de "usuario inexistente" bater com o de "senha
     * errada", fechando o canal lateral de enumeracao de usuarios.
     */
    private static final String HASH_DUMMY =
        "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    private Senhas() {
    }

    public static String hash(String senhaPura) {
        return BCrypt.hashpw(senhaPura, BCrypt.gensalt(CUSTO));
    }

    public static boolean confere(String senhaPura, String hash) {
        if (senhaPura == null || senhaPura.isEmpty()) {
            return false;
        }
        if (hash == null || hash.length() != 60) {
            BCrypt.checkpw(senhaPura, HASH_DUMMY);   // queima o mesmo tempo
            return false;
        }
        try {
            return BCrypt.checkpw(senhaPura, hash);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
