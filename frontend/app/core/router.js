/* ============================================================================
 *  router.js  -  roteador por hash, ~120 linhas, zero dependencia.
 *
 *  Por que nao ngRoute/ui-router: as duas bibliotecas somam ~40 KB para
 *  resolver 4 rotas. Aqui a tabela de rotas e um array e a resolucao e um
 *  split por '/'. Guard de autenticacao embutido.
 * ========================================================================== */
(function (window, angular) {
    'use strict';

    var rotas = [];
    var ouvintes = [];
    var atual = null;

    /**
     *  Router.rota('/clientes/:id', 'route-cliente-form', { publico: false })
     */
    function rota(padrao, componente, opcoes) {
        var partes = padrao.split('/').filter(Boolean);
        rotas.push({
            padrao: padrao,
            partes: partes,
            componente: componente,
            publico: !!(opcoes && opcoes.publico),
            titulo: (opcoes && opcoes.titulo) || ''
        });
        return Router;
    }

    function caminhoAtual() {
        var h = window.location.hash || '#/';
        var semHash = h.charAt(0) === '#' ? h.slice(1) : h;
        var q = semHash.indexOf('?');
        return q < 0 ? semHash : semHash.slice(0, q);
    }

    function queryAtual() {
        var h = window.location.hash || '';
        var q = h.indexOf('?');
        var out = {};
        if (q < 0) {
            return out;
        }
        h.slice(q + 1).split('&').forEach(function (par) {
            if (!par) { return; }
            var kv = par.split('=');
            out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
        });
        return out;
    }

    function casar(caminho) {
        var partes = caminho.split('/').filter(Boolean);
        for (var i = 0; i < rotas.length; i++) {
            var r = rotas[i];
            if (r.partes.length !== partes.length) {
                continue;
            }
            var params = {};
            var bate = true;
            for (var j = 0; j < r.partes.length; j++) {
                var esperado = r.partes[j];
                if (esperado.charAt(0) === ':') {
                    params[esperado.slice(1)] = decodeURIComponent(partes[j]);
                } else if (esperado !== partes[j]) {
                    bate = false;
                    break;
                }
            }
            if (bate) {
                return { rota: r, params: params };
            }
        }
        return null;
    }

    function ir(caminho) {
        window.location.hash = '#' + caminho;
    }

    /** Troca a rota sem empilhar no historico (util depois de salvar). */
    function substituir(caminho) {
        var url = window.location.pathname + window.location.search + '#' + caminho;
        window.history.replaceState(null, '', url);
        resolver();
    }

    function aoMudar(fn) {
        ouvintes.push(fn);
        return function () {
            var i = ouvintes.indexOf(fn);
            if (i >= 0) { ouvintes.splice(i, 1); }
        };
    }

    function resolver() {
        var caminho = caminhoAtual();
        if (!caminho || caminho === '/') {
            ir(window.Store.autenticado() ? '/dashboard' : '/login');
            return;
        }

        var achou = casar(caminho);
        if (!achou) {
            atual = { componente: 'route-404', params: {}, query: {}, caminho: caminho };
            notificar();
            return;
        }

        // guard: rota privada sem token volta para o login guardando o destino
        if (!achou.rota.publico && !window.Store.autenticado()) {
            window.Store.destinoPendente = caminho;
            ir('/login');
            return;
        }
        // ja logado nao fica preso na tela de login
        if (achou.rota.publico && caminho === '/login' && window.Store.autenticado()) {
            ir('/dashboard');
            return;
        }

        atual = {
            componente: achou.rota.componente,
            params: achou.params,
            query: queryAtual(),
            caminho: caminho
        };
        if (achou.rota.titulo) {
            document.title = achou.rota.titulo + ' | comedores-de-fandangos';
        }
        notificar();
    }

    function notificar() {
        for (var i = 0; i < ouvintes.length; i++) {
            ouvintes[i](atual);
        }
    }

    var Router = {
        rota: rota,
        ir: ir,
        substituir: substituir,
        aoMudar: aoMudar,
        resolver: resolver,
        get atual() { return atual; },
        iniciar: function () {
            window.addEventListener('hashchange', resolver);
            resolver();
        }
    };

    window.Router = Router;

    /* ----------------------------------------------------------------------
     * <router-outlet> : compila o componente da rota corrente.
     * Destroi o scope anterior de verdade (senao vaza watcher a cada troca).
     * -------------------------------------------------------------------- */
    angular.module('fandangos').directive('routerOutlet', ['$compile', '$rootScope',
        function ($compile, $rootScope) {
            return {
                restrict: 'E',
                link: function (scope, element) {
                    var scopeFilho = null;
                    var componenteAtivo = null;
                    var caminhoAtivo = null;

                    function pintar(estado) {
                        if (!estado) {
                            return;
                        }
                        // mesmo componente E mesmo caminho: nada a fazer.
                        // Se o parametro mudou (/clientes/1 -> /clientes/2), o
                        // componente PRECISA remontar: o estado dele e do
                        // registro antigo.
                        if (componenteAtivo === estado.componente
                                && caminhoAtivo === estado.caminho && scopeFilho) {
                            scopeFilho.$broadcast('rota:params', estado);
                            return;
                        }
                        caminhoAtivo = estado.caminho;
                        if (scopeFilho) {
                            scopeFilho.$destroy();
                            scopeFilho = null;
                        }
                        element.empty();
                        componenteAtivo = estado.componente;
                        scopeFilho = $rootScope.$new();
                        var el = angular.element('<' + estado.componente + '></' + estado.componente + '>');
                        element.append(el);
                        $compile(el)(scopeFilho);
                    }

                    var desinscrever = window.Router.aoMudar(function (estado) {
                        scope.$applyAsync(function () { pintar(estado); });
                    });

                    scope.$on('$destroy', function () {
                        desinscrever();
                        if (scopeFilho) { scopeFilho.$destroy(); }
                    });

                    pintar(window.Router.atual);
                }
            };
        }]);

}(window, window.angular));
