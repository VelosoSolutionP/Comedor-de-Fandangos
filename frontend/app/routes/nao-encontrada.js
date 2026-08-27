/* rota 404 */
(function (FdReact) {
    'use strict';

    FdReact.componente('route-404', {
        template: [
            '<div class="pagina pagina-vazia">',
            '  <h2>404</h2>',
            '  <p>Essa tela nao existe.</p>',
            '  <a class="btn btn-primario" href="#/dashboard">Ir para o dashboard</a>',
            '</div>'
        ].join(''),
        setup: function () {
            return {};
        }
    });

}(window.FdReact));
