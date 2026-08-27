/* ============================================================================
 *  app-root.js  -  casca da aplicacao: topbar, menu e o <router-outlet>.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useState = FdReact.useState;
    var useEffect = FdReact.useEffect;

    FdReact.componente('app-root', {
        template: [
            '<div class="app" ng-class="{\'app-limpo\': !v.logado}">',

            '  <header class="topbar" ng-if="v.logado">',
            '    <div class="marca">',
            '      <span class="marca-icone">*</span>',
            '      <span class="marca-nome">comedores-de-fandangos</span>',
            '    </div>',
            '    <nav class="nav">',
            '      <a href="#/dashboard" ng-class="{ativo: v.rota === \'/dashboard\'}">Dashboard</a>',
            '      <a href="#/clientes" ng-class="{ativo: v.rotaClientes}">Clientes</a>',
            '      <a href="#/clientes/novo" class="nav-acao">+ Novo cliente</a>',
            '    </nav>',
            '    <div class="usuario">',
            '      <span class="usuario-nome">{{v.nome}}</span>',
            '      <span class="usuario-perfil">{{v.perfilTexto}}</span>',
            '      <span class="sessao" ng-class="{expirando: v.minutos < 10}"',
            '            title="tempo restante da sessao">{{v.minutos}}min</span>',
            '      <button type="button" class="btn-mini" ng-click="v.sair()">Sair</button>',
            '    </div>',
            '  </header>',

            '  <main class="conteudo">',
            '    <router-outlet></router-outlet>',
            '  </main>',

            '  <toast-host></toast-host>',
            '</div>'
        ].join(''),

        setup: function () {
            var s1 = useState(window.Store.sessao);
            var sessao = s1[0];
            var setSessao = s1[1];

            var s2 = useState(window.Router.atual ? window.Router.atual.caminho : '/');
            var caminho = s2[0];
            var setCaminho = s2[1];

            var s3 = useState(window.Store.minutosRestantes());
            var minutos = s3[0];
            var setMinutos = s3[1];

            // sessao mudou (login/logout)
            useEffect(function () {
                return window.Store.aoMudar(function (novo) {
                    // novo objeto a cada mudanca -> useState detecta pela referencia
                    setSessao(angular.extend({}, novo));
                    setMinutos(window.Store.minutosRestantes());
                });
            }, []);

            // rota mudou -> destaca o item de menu
            useEffect(function () {
                return window.Router.aoMudar(function (estado) {
                    setCaminho(estado ? estado.caminho : '/');
                });
            }, []);

            // relogio da sessao: 1 timer para o app inteiro, 60s de intervalo
            useEffect(function () {
                var t = window.setInterval(function () {
                    setMinutos(window.Store.minutosRestantes());
                }, 60000);
                return function () { window.clearInterval(t); };
            }, []);

            return {
                logado: !!sessao.token,
                nome: sessao.nome || '',
                perfilTexto: sessao.perfil === 9 ? 'administrador' : 'operador',
                minutos: minutos,
                rota: caminho,
                rotaClientes: caminho.indexOf('/clientes') === 0,
                sair: function () {
                    window.Store.sair();
                    window.Store.ok('Voce saiu do sistema.');
                }
            };
        }
    });

}(window.FdReact));
