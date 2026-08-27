/* ============================================================================
 *  main.js  -  tabela de rotas e bootstrap.
 * ========================================================================== */
(function (window) {
    'use strict';

    window.Router
        .rota('/login',         'route-login',        { publico: true, titulo: 'Entrar' })
        .rota('/dashboard',     'route-dashboard',    { titulo: 'Dashboard' })
        .rota('/clientes',      'route-clientes',     { titulo: 'Clientes' })
        .rota('/clientes/:id',  'route-cliente-form', { titulo: 'Cadastro de cliente' })
        .rota('/produtos',      'route-produtos',     { titulo: 'Produtos' })
        .rota('/produtos/:id',  'route-produto-form', { titulo: 'Cadastro de produto' });

    // sessao caiu em qualquer aba -> todas voltam para o login
    window.addEventListener('storage', function (e) {
        if (e.key === 'fdg.sessao' && !e.newValue && window.location.hash !== '#/login') {
            window.location.hash = '#/login';
        }
    });

    window.Router.iniciar();
    window.FdReactDOM.render('#raiz', 'app-root');

}(window));
