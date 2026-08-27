/* ============================================================================
 *  routes/produtos.js  -  catalogo de produtos.
 *
 *  Mesma mecanica da lista de clientes: useDebounce na busca, request
 *  cancelavel e resposta colunar remontada no cliente.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useState = FdReact.useState;
    var useEffect = FdReact.useEffect;
    var useRef = FdReact.useRef;
    var useDebounce = FdReact.useDebounce;

    var SITUACOES = { 0: 'Inativo', 1: 'Ativo', 2: 'Descontinuado' };

    FdReact.componente('route-produtos', {
        template: [
            '<div class="pagina">',
            '  <div class="pagina-cabecalho">',
            '    <h2>Produtos</h2>',
            '    <button type="button" class="btn btn-primario" ng-click="v.novo()">+ Novo produto</button>',
            '  </div>',

            '  <div class="filtros">',
            '    <input class="busca" type="search" placeholder="Buscar por SKU, nome ou categoria..."',
            '           ng-model="v.termo" ng-change="v.mudouTermo()" spellcheck="false">',
            '    <select ng-model="v.categoria" ng-change="v.mudouFiltro()">',
            '      <option value="">Todas as categorias</option>',
            '      <option ng-repeat="c in v.categorias track by c[0]" value="{{c[0]}}">{{c[0]}} ({{c[1]}})</option>',
            '    </select>',
            '    <select ng-model="v.situacao" ng-change="v.mudouFiltro()">',
            '      <option value="">Todas as situacoes</option>',
            '      <option value="1">Ativos</option>',
            '      <option value="0">Inativos</option>',
            '      <option value="2">Descontinuados</option>',
            '    </select>',
            '    <button type="button" class="btn-mini" ng-class="{ativo: v.repor}"',
            '            ng-click="v.alternarRepor()">Repor estoque</button>',
            '    <button type="button" class="btn-mini" ng-click="v.limpar()"',
            '            ng-disabled="!v.temFiltro">Limpar</button>',
            '  </div>',

            '  <div class="grid-wrap">',
            '    <div class="grid-scroll">',
            '    <table class="grid">',
            '      <thead>',
            '        <tr>',
            '          <th class="col-sku">SKU</th>',
            '          <th>Produto</th>',
            '          <th class="col-cat">Categoria</th>',
            '          <th class="col-num">Preco</th>',
            '          <th class="col-num">Estoque</th>',
            '          <th class="col-sit">Situacao</th>',
            '          <th class="col-acoes"></th>',
            '        </tr>',
            '      </thead>',
            '      <tbody ng-class="{esmaecido: v.carregando}">',
            '        <tr ng-repeat="p in v.itens track by p.id" ng-dblclick="v.abrir(p)"',
            '            ng-class="{\'linha-alerta\': p.rep}">',
            '          <td class="mono">{{p.sku}}</td>',
            '          <td class="nome">{{p.nm}}</td>',
            '          <td>{{p.cat}}</td>',
            '          <td class="col-num mono">{{v.moeda(p.pr)}}</td>',
            '          <td class="col-num mono">',
            '            {{p.est}}',
            '            <span class="tag sit-2" ng-if="p.rep" title="estoque no minimo ou abaixo">repor</span>',
            '          </td>',
            '          <td><span class="tag" ng-class="\'sit-\' + p.sit">{{v.situacaoTexto(p.sit)}}</span></td>',
            '          <td class="acoes">',
            '            <button type="button" class="btn-mini" ng-click="v.abrir(p)">Editar</button>',
            '            <button type="button" class="btn-mini btn-perigo" ng-click="v.excluir(p)">Excluir</button>',
            '          </td>',
            '        </tr>',
            '        <tr ng-if="!v.itens.length && !v.carregando">',
            '          <td colspan="7" class="vazio">Nenhum produto encontrado.</td>',
            '        </tr>',
            '      </tbody>',
            '    </table>',
            '    </div>',
            '    <div class="paginacao">',
            '      <span class="contagem">{{v.primeiro}}-{{v.ultimo}} de {{v.total}}</span>',
            '      <button type="button" class="btn-mini" ng-disabled="v.pagina <= 0 || v.carregando"',
            '              ng-click="v.paginar(v.pagina - 1)">Anterior</button>',
            '      <span class="pagina-atual">{{v.pagina + 1}} / {{v.totalPaginas}}</span>',
            '      <button type="button" class="btn-mini"',
            '              ng-disabled="v.pagina + 1 >= v.totalPaginas || v.carregando"',
            '              ng-click="v.paginar(v.pagina + 1)">Proxima</button>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join(''),

        setup: function () {
            var st = useRef(null);
            if (!st.current) {
                var q = (window.Router.atual && window.Router.atual.query) || {};
                st.current = { termo: q.q || '', categoria: q.cat || '', situacao: q.sit || '' };
            }

            var t1 = useState(st.current.termo);
            var termo = t1[0];
            var setTermo = t1[1];

            var f1 = useState(0);
            var seq = f1[0];
            var setSeq = f1[1];

            var p1 = useState(0);
            var pagina = p1[0];
            var setPagina = p1[1];

            var r1 = useState(false);
            var repor = r1[0];
            var setRepor = r1[1];

            var d1 = useState({ itens: [], total: 0, tamanho: 20 });
            var dados = d1[0];
            var setDados = d1[1];

            var c1 = useState(true);
            var carregando = c1[0];
            var setCarregando = c1[1];

            var k1 = useState([]);
            var categorias = k1[0];
            var setCategorias = k1[1];

            var termoDebounced = useDebounce(termo, 350);

            // combo de categorias: cacheado no Http, entao 1 request por sessao
            useEffect(function () {
                window.Http.categoriasProduto()
                    .then(setCategorias)
                    .catch(function () { setCategorias([]); });
            }, []);

            useEffect(function () {
                setCarregando(true);
                window.Http.produtos({
                    q: termoDebounced || null,
                    cat: st.current.categoria || null,
                    sit: st.current.situacao === '' ? null : st.current.situacao,
                    rep: repor ? 1 : null,
                    pg: pagina,
                    sz: 20
                })
                    .then(function (r) {
                        setDados({ itens: r.itens, total: r.total, tamanho: r.tamanho });
                        setCarregando(false);
                    })
                    .catch(function (err) {
                        if (window.axios.isCancel && window.axios.isCancel(err)) {
                            return;
                        }
                        setCarregando(false);
                        window.Store.erro(window.Http.mensagem(err, 'Falha ao listar produtos.'));
                    });
            }, [termoDebounced, seq, pagina, repor]);

            useEffect(function () {
                return function () { window.Http.cancelar('gridProduto'); };
            }, []);

            function recarregar() {
                setSeq(function (n) { return n + 1; });
            }

            var totalPaginas = Math.max(1, Math.ceil(dados.total / (dados.tamanho || 20)));

            return {
                itens: dados.itens,
                total: dados.total,
                pagina: pagina,
                carregando: carregando,
                categorias: categorias,
                repor: repor,
                totalPaginas: totalPaginas,
                primeiro: dados.total === 0 ? 0 : (pagina * dados.tamanho) + 1,
                ultimo: Math.min(dados.total, (pagina + 1) * dados.tamanho),

                get termo() { return st.current.termo; },
                set termo(v) { st.current.termo = v; },
                get categoria() { return st.current.categoria; },
                set categoria(v) { st.current.categoria = v; },
                get situacao() { return st.current.situacao; },
                set situacao(v) { st.current.situacao = v; },

                temFiltro: !!(st.current.termo || st.current.categoria || st.current.situacao || repor),

                moeda: function (n) { return 'R$ ' + window.Mask.numeroParaMoeda(Number(n)); },
                situacaoTexto: function (s) { return SITUACOES[s] || '?'; },

                mudouTermo: function () { setPagina(0); setTermo(st.current.termo); },
                mudouFiltro: function () { setPagina(0); recarregar(); },
                alternarRepor: function () { setPagina(0); setRepor(!repor); },
                limpar: function () {
                    st.current.termo = '';
                    st.current.categoria = '';
                    st.current.situacao = '';
                    setPagina(0);
                    setRepor(false);
                    setTermo('');
                    recarregar();
                },
                paginar: function (p) {
                    if (p >= 0 && p < totalPaginas) { setPagina(p); }
                },
                novo: function () { window.Router.ir('/produtos/novo'); },
                abrir: function (p) { window.Router.ir('/produtos/' + p.id); },
                excluir: function (p) {
                    if (!window.confirm('Excluir o produto "' + p.nm + '" (' + p.sku + ')?')) {
                        return;
                    }
                    window.Http.excluirProduto(p.id)
                        .then(function () {
                            window.Store.ok('Produto excluido.');
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
