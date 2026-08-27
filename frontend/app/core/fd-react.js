/* ============================================================================
 *  fd-react.js  -  hooks estilo React rodando em cima do AngularJS 1.8
 *
 *  A ideia: manter o AngularJS como motor de DOM (compile + digest, que ja
 *  esta em producao ha uma decada) e escrever os componentes com o modelo
 *  mental moderno: setup() puro, useState, useEffect, useMemo, useRef.
 *
 *  Ponto de performance (o motivo real de existir este arquivo):
 *  o AngularJS re-avalia expressoes de template a CADA digest. Aqui, o
 *  setup() so roda quando um setState acontece ou quando uma prop muda. O
 *  template le de um objeto ja calculado (v.*), entao o digest so compara
 *  referencias. Componente que nao mudou custa quase nada.
 * ========================================================================== */
(function (window, angular) {
    'use strict';

    var mod = angular.module('fandangos');

    /* ---------------------------------------------------------------------
     * Instancia corrente sendo renderizada. Os hooks leem daqui - e por isso
     * que hook nao pode ser chamado dentro de if/for: a ordem dos slots e a
     * identidade deles.
     * ------------------------------------------------------------------- */
    var atual = null;

    function exigirContexto(hook) {
        if (!atual) {
            throw new Error('[fd-react] ' + hook + '() so pode ser chamado dentro de setup()');
        }
        return atual;
    }

    function slot(inst) {
        var i = inst.cursor++;
        if (inst.slots.length <= i) {
            inst.slots[i] = {};
        }
        return inst.slots[i];
    }

    function depsMudaram(anteriores, novas) {
        if (!novas) {
            return true;                       // sem deps = roda todo render
        }
        if (!anteriores || anteriores.length !== novas.length) {
            return true;
        }
        for (var i = 0; i < novas.length; i++) {
            if (!Object.is(anteriores[i], novas[i])) {
                return true;
            }
        }
        return false;
    }

    /* ------------------------------------------------------------------ hooks */

    function useState(inicial) {
        var inst = exigirContexto('useState');
        var s = slot(inst);
        if (!s.pronto) {
            s.pronto = true;
            s.valor = typeof inicial === 'function' ? inicial() : inicial;
        }
        var set = s.set || (s.set = function (novo) {
            var v = typeof novo === 'function' ? novo(s.valor) : novo;
            if (Object.is(v, s.valor)) {
                return;                        // mesmo valor: nao re-renderiza
            }
            s.valor = v;
            inst.agendar();
        });
        return [s.valor, set];
    }

    /** Estado que NAO dispara render. Bom para timers, AbortController, DOM. */
    function useRef(inicial) {
        var inst = exigirContexto('useRef');
        var s = slot(inst);
        if (!s.pronto) {
            s.pronto = true;
            s.ref = { current: inicial };
        }
        return s.ref;
    }

    function useMemo(calcular, deps) {
        var inst = exigirContexto('useMemo');
        var s = slot(inst);
        if (!s.pronto || depsMudaram(s.deps, deps)) {
            s.pronto = true;
            s.deps = deps;
            s.valor = calcular();
        }
        return s.valor;
    }

    function useCallback(fn, deps) {
        return useMemo(function () { return fn; }, deps);
    }

    /**
     * Efeito colateral. Roda DEPOIS do render. Se retornar uma funcao, ela e
     * chamada antes do proximo efeito e no unmount (cleanup).
     */
    function useEffect(efeito, deps) {
        var inst = exigirContexto('useEffect');
        var s = slot(inst);
        if (!s.pronto || depsMudaram(s.deps, deps)) {
            s.pronto = true;
            s.deps = deps;
            inst.pendentes.push(s);
            s.efeito = efeito;
        }
    }

    /** Valor que so "assenta" apos ms sem mudanca. Segura request por tecla. */
    function useDebounce(valor, ms) {
        var par = useState(valor);
        var debounced = par[0];
        var setDebounced = par[1];
        useEffect(function () {
            var t = window.setTimeout(function () { setDebounced(valor); }, ms || 300);
            return function () { window.clearTimeout(t); };
        }, [valor, ms]);
        return debounced;
    }

    /* -------------------------------------------------------- componente */

    function paraKebab(nome) {
        return nome.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    }

    function paraCamel(nome) {
        return nome.replace(/-([a-z0-9])/g, function (_, c) { return c.toUpperCase(); });
    }

    /**
     * Registra um componente.
     *
     *   FdReact.componente('kpi-card', {
     *       props: ['titulo', 'valor'],        // one-way binding '<'
     *       eventos: ['aoClicar'],             // callback '&'
     *       template: '<div>{{v.texto}}</div>',
     *       setup: function (props, ctx) { ... return { texto: ... }; }
     *   });
     */
    function componente(nome, def) {
        var props = def.props || [];
        var eventos = def.eventos || [];

        var bindings = {};
        props.forEach(function (p) { bindings[p] = '<'; });
        eventos.forEach(function (e) { bindings[e] = '&'; });

        mod.directive(paraCamel(nome), ['$timeout', function ($timeout) {
            return {
                restrict: 'E',
                scope: bindings,
                template: def.template,
                link: function (scope, element, attrs) {
                    var inst = {
                        slots: [],
                        cursor: 0,
                        pendentes: [],
                        vivo: true,
                        agendado: false
                    };

                    var ctx = {
                        elemento: element,
                        atributos: attrs,
                        /** dispara um evento declarado em `eventos` */
                        emitir: function (nomeEvento, carga) {
                            var fn = scope[nomeEvento];
                            if (typeof fn === 'function') {
                                fn({ $e: carga });
                            }
                        },
                        /** forca render manual (raro; use setState) */
                        render: function () { inst.agendar(); }
                    };

                    inst.agendar = function () {
                        if (!inst.vivo || inst.agendado) {
                            return;                       // coalesce: N setState = 1 render
                        }
                        inst.agendado = true;
                        scope.$applyAsync(function () {
                            inst.agendado = false;
                            renderizar();
                        });
                    };

                    function renderizar() {
                        if (!inst.vivo) {
                            return;
                        }
                        var anterior = atual;
                        atual = inst;
                        inst.cursor = 0;
                        try {
                            scope.v = def.setup(scope, ctx) || {};
                        } finally {
                            atual = anterior;
                        }
                        if (inst.pendentes.length) {
                            aplicarEfeitos();
                        }
                    }

                    function aplicarEfeitos() {
                        var fila = inst.pendentes;
                        inst.pendentes = [];
                        // depois do digest: o DOM ja reflete este render
                        $timeout(function () {
                            for (var i = 0; i < fila.length && inst.vivo; i++) {
                                var s = fila[i];
                                if (typeof s.limpar === 'function') {
                                    try { s.limpar(); } catch (e) { console.error(e); }
                                    s.limpar = null;
                                }
                                var r = s.efeito();
                                s.limpar = typeof r === 'function' ? r : null;
                            }
                        }, 0, false);
                    }

                    // props mudaram no pai -> re-render (equivalente ao re-render
                    // por props do React). $watchGroup compara por referencia.
                    if (props.length) {
                        scope.$watchGroup(props, function (novo, velho) {
                            if (novo !== velho) {
                                renderizar();
                            }
                        });
                    }

                    scope.$on('$destroy', function () {
                        inst.vivo = false;
                        inst.slots.forEach(function (s) {
                            if (typeof s.limpar === 'function') {
                                try { s.limpar(); } catch (e) { console.error(e); }
                            }
                        });
                        inst.slots.length = 0;
                    });

                    renderizar();
                }
            };
        }]);

        return nome;
    }

    /* ------------------------------------------------------------ FdReactDOM */

    var FdReactDOM = {
        /**
         * Monta a aplicacao. Equivalente ao ReactDOM.createRoot().render(),
         * so que quem faz o bootstrap e o AngularJS.
         */
        render: function (seletorRaiz, componenteRaiz) {
            var raiz = document.querySelector(seletorRaiz);
            if (!raiz) {
                throw new Error('[fd-react] raiz nao encontrada: ' + seletorRaiz);
            }
            raiz.innerHTML = '<' + paraKebab(componenteRaiz) + '></' + paraKebab(componenteRaiz) + '>';
            angular.element(document).ready(function () {
                angular.bootstrap(raiz, ['fandangos'], { strictDi: true });
            });
        }
    };

    window.FdReact = {
        componente: componente,
        useState: useState,
        useEffect: useEffect,
        useMemo: useMemo,
        useCallback: useCallback,
        useRef: useRef,
        useDebounce: useDebounce
    };
    window.FdReactDOM = FdReactDOM;

}(window, window.angular));
