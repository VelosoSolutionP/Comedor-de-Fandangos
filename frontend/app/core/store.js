/* ============================================================================
 *  store.js  -  estado global minimo (sessao + notificacoes).
 *
 *  Nao e Redux. Sao ~90 linhas com pub/sub, porque o unico estado realmente
 *  global deste sistema e "quem esta logado" e "que toast mostrar".
 * ========================================================================== */
(function (window) {
    'use strict';

    var CHAVE = 'fdg.sessao';

    var estado = {
        token: null,
        nome: null,
        perfil: 0,
        expiraEm: 0
    };

    var ouvintes = [];
    var ouvintesToast = [];

    function carregar() {
        try {
            var cru = window.localStorage.getItem(CHAVE);
            if (!cru) {
                return;
            }
            var s = JSON.parse(cru);
            // token vencido nao volta do storage
            if (s && s.token && s.expiraEm > (Date.now() / 1000)) {
                estado = s;
            } else {
                window.localStorage.removeItem(CHAVE);
            }
        } catch (e) {
            window.localStorage.removeItem(CHAVE);
        }
    }

    function persistir() {
        try {
            if (estado.token) {
                window.localStorage.setItem(CHAVE, JSON.stringify(estado));
            } else {
                window.localStorage.removeItem(CHAVE);
            }
        } catch (e) {
            /* modo privado: segue sem persistir */
        }
    }

    function notificar() {
        for (var i = 0; i < ouvintes.length; i++) {
            ouvintes[i](estado);
        }
    }

    var Store = {
        get sessao() { return estado; },

        autenticado: function () {
            return !!estado.token && estado.expiraEm > (Date.now() / 1000);
        },

        /** minutos que faltam para o token expirar (para o aviso na topbar) */
        minutosRestantes: function () {
            if (!estado.token) { return 0; }
            return Math.max(0, Math.floor((estado.expiraEm - Date.now() / 1000) / 60));
        },

        entrar: function (resposta) {
            estado = {
                token: resposta.t,
                nome: resposta.n,
                perfil: resposta.r,
                expiraEm: resposta.e
            };
            persistir();
            notificar();
        },

        sair: function () {
            estado = { token: null, nome: null, perfil: 0, expiraEm: 0 };
            persistir();
            notificar();
            if (window.location.hash !== '#/login') {
                window.location.hash = '#/login';
            }
        },

        aoMudar: function (fn) {
            ouvintes.push(fn);
            return function () {
                var i = ouvintes.indexOf(fn);
                if (i >= 0) { ouvintes.splice(i, 1); }
            };
        },

        /* --------------------------------------------------------- toasts */

        toast: function (texto, tipo) {
            var t = { id: Date.now() + Math.random(), texto: texto, tipo: tipo || 'info' };
            for (var i = 0; i < ouvintesToast.length; i++) {
                ouvintesToast[i](t);
            }
        },
        ok: function (texto) { Store.toast(texto, 'ok'); },
        erro: function (texto) { Store.toast(texto, 'erro'); },

        aoToast: function (fn) {
            ouvintesToast.push(fn);
            return function () {
                var i = ouvintesToast.indexOf(fn);
                if (i >= 0) { ouvintesToast.splice(i, 1); }
            };
        },

        /** caminho que o usuario tentou abrir antes de cair no login */
        destinoPendente: null
    };

    carregar();
    window.Store = Store;

}(window));
