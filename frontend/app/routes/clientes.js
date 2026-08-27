/* ============================================================================
 *  routes/clientes.js  -  listagem com busca.
 *
 *  A busca usa useDebounce (350ms) + request cancelavel. Digitar "fandangos"
 *  dispara 1 chamada, nao 9, e nenhuma resposta atrasada sobrescreve a atual.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useState = FdReact.useState;
    var useEffect = FdReact.useEffect;
    var useRef = FdReact.useRef;
    var useDebounce = FdReact.useDebounce;

    FdReact.componente('route-clientes', {
        template: [
            '<div class="pagina">',
            '  <div class="pagina-cabecalho">',
            '    <h2>Clientes</h2>',
            '    <button type="button" class="btn btn-primario" ng-click="v.novo()">+ Novo cliente</button>',
            '  </div>',

            '  <div class="filtros">',
            '    <input class="busca" type="search" placeholder="Buscar por nome, razao social ou documento..."',
            '           ng-model="v.termo" ng-change="v.mudouTermo()" spellcheck="false">',
            '    <select ng-model="v.uf" ng-change="v.mudouFiltro()">',
            '      <option value="">Todas as UFs</option>',
            '      <option ng-repeat="u in v.ufs track by u" value="{{u}}">{{u}}</option>',
            '    </select>',
            '    <select ng-model="v.situacao" ng-change="v.mudouFiltro()">',
            '      <option value="">Todas as situacoes</option>',
            '      <option value="1">Ativos</option>',
            '      <option value="0">Inativos</option>',
            '      <option value="2">Bloqueados</option>',
            '    </select>',
            '    <button type="button" class="btn-mini" ng-click="v.limpar()"',
            '            ng-disabled="!v.temFiltro">Limpar</button>',
            '  </div>',

            '  <fd-grid itens="v.itens" total="v.total" pagina="v.pagina" tamanho="v.tamanho"',
            '             carregando="v.carregando"',
            '             ao-abrir="v.abrir($e)" ao-excluir="v.excluir($e)"',
            '             ao-paginar="v.paginar($e)"></fd-grid>',
            '</div>'
        ].join(''),

        setup: function () {
            var st = useRef(null);
            if (!st.current) {
                // filtros vivem num objeto estavel: ng-model precisa de referencia fixa
                var q = (window.Router.atual && window.Router.atual.query) || {};
                st.current = {
                    termo: q.q || '',
                    uf: q.uf || '',
                    situacao: q.sit || ''
                };
            }

            var t1 = useState(st.current.termo);
            var termo = t1[0];
            var setTermo = t1[1];

            var f1 = useState(0);
            var filtroSeq = f1[0];
            var setFiltroSeq = f1[1];

            var p1 = useState(0);
            var pagina = p1[0];
            var setPagina = p1[1];

            var d1 = useState({ itens: [], total: 0, tamanho: 20 });
            var dados = d1[0];
            var setDados = d1[1];

            var c1 = useState(true);
            var carregando = c1[0];
            var setCarregando = c1[1];

            // so busca depois que o usuario para de digitar
            var termoDebounced = useDebounce(termo, 350);

            useEffect(function () {
                setCarregando(true);

                var filtros = {
                    q: termoDebounced || null,
                    uf: st.current.uf || null,
                    sit: st.current.situacao === '' ? null : st.current.situacao,
                    pg: pagina,
                    sz: 20
                };

                window.Http.clientes(filtros)
                    .then(function (r) {
                        setDados({ itens: r.itens, total: r.total, tamanho: r.tamanho });
                        setCarregando(false);
                    })
                    .catch(function (err) {
                        // request abortado por outro mais novo: nao e erro
                        if (window.axios.isCancel && window.axios.isCancel(err)) {
                            return;
                        }
                        setCarregando(false);
                        window.Store.erro(window.Http.mensagem(err, 'Falha ao listar clientes.'));
                    });

                return function () { /* o proprio Http cancela o anterior */ };
            }, [termoDebounced, filtroSeq, pagina]);

            useEffect(function () {
                return function () { window.Http.cancelar('grid'); };
            }, []);

            function recarregar() {
                setFiltroSeq(function (n) { return n + 1; });
            }

            return {
                itens: dados.itens,
                total: dados.total,
                tamanho: dados.tamanho,
                pagina: pagina,
                carregando: carregando,
                ufs: window.Validar.ufs,

                get termo() { return st.current.termo; },
                set termo(v) { st.current.termo = v; },
                get uf() { return st.current.uf; },
                set uf(v) { st.current.uf = v; },
                get situacao() { return st.current.situacao; },
                set situacao(v) { st.current.situacao = v; },

                temFiltro: !!(st.current.termo || st.current.uf || st.current.situacao),

                mudouTermo: function () {
                    setPagina(0);
                    setTermo(st.current.termo);
                },
                mudouFiltro: function () {
                    setPagina(0);
                    recarregar();
                },
                limpar: function () {
                    st.current.termo = '';
                    st.current.uf = '';
                    st.current.situacao = '';
                    setPagina(0);
                    setTermo('');
                    recarregar();
                },
                paginar: function (p) {
                    setPagina(p);
                },
                novo: function () {
                    window.Router.ir('/clientes/novo');
                },
                abrir: function (c) {
                    window.Router.ir('/clientes/' + c.id);
                },
                excluir: function (c) {
                    if (!window.confirm('Excluir o cliente "' + c.nm + '"?\nEssa acao nao pode ser desfeita.')) {
                        return;
                    }
                    window.Http.excluirCliente(c.id)
                        .then(function () {
                            window.Store.ok('Cliente excluido.');
                            recarregar();
                        })
                        .catch(function (err) {
                            window.Store.erro(window.Http.mensagem(err, 'Nao foi possivel excluir.'));
                        });
                }
            };
        }
    });

}(window.FdReact));
