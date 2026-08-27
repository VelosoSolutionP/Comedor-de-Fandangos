/* ============================================================================
 *  http.js  -  axios configurado para AJAX enxuto.
 *
 *  O que este arquivo economiza:
 *   - Authorization injetado uma vez, no interceptor (nada de repetir header).
 *   - Requests obsoletos sao ABORTADOS: digitar "fandangos" na busca dispara
 *     1 request, nao 9 - e a resposta que chega e sempre a da ultima tecla.
 *   - Deduplicacao: dois componentes pedindo a mesma URL no mesmo tick
 *     compartilham UMA promise.
 *   - Cache curto em memoria para GET idempotente (grid/dash), com o
 *     navegador ainda validando por ETag no servidor.
 * ========================================================================== */
(function (window, axios) {
    'use strict';

    var api = axios.create({
        baseURL: '/api',
        timeout: 15000,
        headers: { 'Accept': 'application/json' },
        // nao serializa null/undefined em query string
        paramsSerializer: function (params) {
            var out = [];
            Object.keys(params || {}).forEach(function (k) {
                var v = params[k];
                if (v === null || v === undefined || v === '') {
                    return;
                }
                out.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
            });
            return out.join('&');
        }
    });

    /* ------------------------------------------------------- interceptors */

    api.interceptors.request.use(function (cfg) {
        var s = window.Store.sessao;
        if (s.token) {
            cfg.headers.Authorization = 'Bearer ' + s.token;
        }
        return cfg;
    });

    api.interceptors.response.use(
        function (res) {
            return res;
        },
        function (err) {
            if (axios.isCancel && axios.isCancel(err)) {
                return Promise.reject(err);      // cancelamento nao e erro
            }
            var status = err.response && err.response.status;

            if (status === 401) {
                window.Store.sair();
                window.Store.erro('Sessao expirada. Entre novamente.');
            } else if (status === 403) {
                window.Store.erro('Voce nao tem permissao para essa acao.');
            } else if (status === 429) {
                window.Store.erro('Muitas tentativas. Aguarde um instante.');
            } else if (!err.response) {
                window.Store.erro('Sem resposta do servidor.');
            }
            return Promise.reject(err);
        }
    );

    /* ------------------------------------------------------------ helpers */

    /** Mensagem legivel a partir do corpo de erro {"e":"...","c":"..."} */
    function mensagem(err, padrao) {
        if (err && err.response && err.response.data && err.response.data.e) {
            return err.response.data.e;
        }
        return padrao || 'Falha inesperada.';
    }

    function codigo(err) {
        return (err && err.response && err.response.data && err.response.data.c) || null;
    }

    /* ------------------------------------------- cancelamento por "canal" */

    var controladores = {};

    /**
     * GET que cancela automaticamente o request anterior do mesmo canal.
     * Uso classico: busca conforme digitacao.
     */
    function getCancelavel(canal, url, params) {
        if (controladores[canal]) {
            controladores[canal].abort();
        }
        var ac = new AbortController();
        controladores[canal] = ac;
        return api.get(url, { params: params, signal: ac.signal })
            .then(function (res) {
                if (controladores[canal] === ac) {
                    delete controladores[canal];
                }
                return res;
            });
    }

    function cancelar(canal) {
        if (controladores[canal]) {
            controladores[canal].abort();
            delete controladores[canal];
        }
    }

    /* -------------------------------------------------- cache/dedupe de GET */

    var emVoo = {};                 // url -> promise (dedupe)
    var cache = {};                 // url -> {t, dados}
    var TTL_PADRAO = 8000;

    /**
     * GET com cache curto em memoria. Serve para dado que varias telas pedem
     * ao mesmo tempo (KPIs, combos). Nao substitui o ETag: complementa.
     */
    function getCacheado(url, params, ttl) {
        var chave = url + '?' + JSON.stringify(params || {});
        var agora = Date.now();
        var c = cache[chave];
        if (c && (agora - c.t) < (ttl || TTL_PADRAO)) {
            return Promise.resolve(c.dados);
        }
        if (emVoo[chave]) {
            return emVoo[chave];
        }
        emVoo[chave] = api.get(url, { params: params })
            .then(function (res) {
                cache[chave] = { t: Date.now(), dados: res.data };
                delete emVoo[chave];
                return res.data;
            })
            .catch(function (e) {
                delete emVoo[chave];
                throw e;
            });
        return emVoo[chave];
    }

    function limparCache(prefixo) {
        Object.keys(cache).forEach(function (k) {
            if (!prefixo || k.indexOf(prefixo) === 0) {
                delete cache[k];
            }
        });
    }

    /* ------------------------------------------------------------- API do app */

    window.Http = {
        api: api,
        mensagem: mensagem,
        codigo: codigo,
        getCancelavel: getCancelavel,
        cancelar: cancelar,
        getCacheado: getCacheado,
        limparCache: limparCache,

        /* --------------------------------------------------- endpoints */

        login: function (usuario, senha) {
            return api.post('/auth/login', { u: usuario, p: senha }).then(function (r) { return r.data; });
        },

        /** grid colunar -> lista de objetos, remontada em O(n) */
        clientes: function (filtros) {
            return getCancelavel('grid', '/clientes', filtros).then(function (r) {
                return window.Http.expandirGrid(r.data);
            });
        },

        cliente: function (id) {
            return api.get('/clientes/' + id).then(function (r) { return r.data; });
        },

        salvarCliente: function (dto) {
            limparCache('/dash');
            return dto.id
                ? api.put('/clientes/' + dto.id, dto).then(function () { return dto.id; })
                : api.post('/clientes', dto).then(function (r) { return r.data.id; });
        },

        excluirCliente: function (id) {
            limparCache('/dash');
            return api.delete('/clientes/' + id);
        },

        lookup: function (documento) {
            return api.get('/lookup/' + documento).then(function (r) { return r.data; });
        },

        dashboard: function (dias) {
            return getCacheado('/dash', { d: dias || 30 }, 20000);
        },

        /**
         * {"c":["id","nm",...],"r":[[1,"Ana",...]],"t":2000}
         *   -> {itens:[{id:1,nm:'Ana',...}], total:2000, pagina, tamanho}
         */
        expandirGrid: function (g) {
            var cols = g.c || [];
            var linhas = g.r || [];
            var itens = new Array(linhas.length);
            for (var i = 0; i < linhas.length; i++) {
                var o = {};
                var l = linhas[i];
                for (var j = 0; j < cols.length; j++) {
                    o[cols[j]] = l[j];
                }
                itens[i] = o;
            }
            return { itens: itens, total: g.t || 0, pagina: g.p || 0, tamanho: g.s || 20 };
        }
    };

}(window, window.axios));
