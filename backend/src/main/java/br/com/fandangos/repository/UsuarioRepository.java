package br.com.fandangos.repository;

import br.com.fandangos.domain.Usuario;

import javax.ejb.Stateless;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.List;

@Stateless
public class UsuarioRepository {

    @PersistenceContext(unitName = "fandangosPU")
    private EntityManager em;

    public Usuario porLogin(String login) {
        final List<Usuario> r = em.createNamedQuery("Usuario.porLogin", Usuario.class)
                .setParameter("login", login)
                .setMaxResults(1)
                .getResultList();
        return r.isEmpty() ? null : r.get(0);
    }

    /** Contador de falhas fora da transacao do login (nao segura o request). */
    public void registrarFalha(String login) {
        em.createNativeQuery(
                "UPDATE usuario SET falhas_login = falhas_login + 1 WHERE login = ?1")
          .setParameter(1, login)
          .executeUpdate();
    }

    public void registrarSucesso(Long id) {
        em.createNativeQuery(
                "UPDATE usuario SET falhas_login = 0, ultimo_acesso = now() WHERE id = ?1")
          .setParameter(1, id)
          .executeUpdate();
    }
}
