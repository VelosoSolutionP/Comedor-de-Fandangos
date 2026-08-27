/* ============================================================================
 *  routes/dashboard.js
 *
 *  Uma unica chamada (/api/dash) alimenta os 6 KPIs e os 2 graficos. O
 *  refresh automatico existe, mas na maioria das vezes volta 304 pelo ETag e
 *  nao transfere corpo nenhum.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useState = FdReact.useState;
    var useEffect = FdReact.useEffect;
    var useMemo = FdReact.useMemo;

    FdReact.componente('route-dashboard', {
        template: [
            '<div class="pagina">',
            '  <div class="pagina-cabecalho">',
            '    <h2>Dashboard</h2>',
            '    <div class="periodo">',
            '      <button type="button" ng-repeat="d in v.periodos"',
            '              class="btn-mini" ng-class="{ativo: d === v.dias}"',
            '              ng-click="v.trocarPeriodo(d)">{{d}}d</button>',
            '      <button type="button" class="btn-mini" ng-click="v.recarregar()"',
            '              ng-disabled="v.carregando">Atualizar</button>',
            '    </div>',
            '  </div>',

            '  <div class="kpis">',
            '    <kpi-card titulo="\'Clientes\'" valor="v.k.t" formato="\'compacto\'" cor="\'primario\'"',
            '              dica="\'base total cadastrada\'"></kpi-card>',
            '    <kpi-card titulo="\'Pessoa fisica\'" valor="v.k.f" cor="\'neutro\'"></kpi-card>',
            '    <kpi-card titulo="\'Pessoa juridica\'" valor="v.k.j" cor="\'neutro\'"></kpi-card>',
            '    <kpi-card titulo="\'Ativos\'" valor="v.k.a" cor="\'ok\'"></kpi-card>',
            '    <kpi-card titulo="\'Bloqueados\'" valor="v.k.b" cor="\'alerta\'"></kpi-card>',
            '    <kpi-card titulo="\'Novos no periodo\'" valor="v.k.n" cor="\'primario\'"',
            '              dica="v.dicaPeriodo"></kpi-card>',
            '    <kpi-card titulo="\'Limite de credito (ativos)\'" valor="v.k.lc" formato="\'moeda\'"',
            '              cor="\'ok\'"></kpi-card>',
            '  </div>',

            '  <div class="graficos">',
            '    <bar-chart titulo="\'Cadastros por dia\'" dados="v.serie" altura="140"></bar-chart>',
            '    <bar-chart titulo="\'Top 8 UFs\'" dados="v.ufs" altura="140" cor="\'#3b7dd8\'"></bar-chart>',
            '  </div>',

            '  <div class="rodape-info">',
            '    <span ng-if="v.carregando">carregando...</span>',
            '    <span ng-if="!v.carregando && v.atualizado">atualizado as {{v.atualizado}}</span>',
            '    <span class="sep">|</span>',
            '    <span>1 request para todo o painel</span>',
            '  </div>',
            '</div>'
        ].join(''),

        setup: function () {
            var d1 = useState(30);
            var dias = d1[0];
            var setDias = d1[1];

            var r1 = useState(null);
            var resposta = r1[0];
            var setResposta = r1[1];

            var c1 = useState(true);
            var carregando = c1[0];
            var setCarregando = c1[1];

            var t1 = useState(0);
            var gatilho = t1[0];
            var setGatilho = t1[1];

            var a1 = useState('');
            var atualizado = a1[0];
            var setAtualizado = a1[1];

            /* Busca sempre que o periodo mudar ou o usuario pedir refresh. */
            useEffect(function () {
                var vivo = true;
                setCarregando(true);

                window.Http.dashboard(dias)
                    .then(function (dados) {
                        if (!vivo) { return; }
                        setResposta(dados);
                        setAtualizado(new Date().toLocaleTimeString('pt-BR'));
                    })
                    .catch(function (err) {
                        if (vivo) {
                            window.Store.erro(window.Http.mensagem(err, 'Falha ao carregar o painel.'));
                        }
                    })
                    .finally(function () {
                        if (vivo) { setCarregando(false); }
                    });

                return function () { vivo = false; };
            }, [dias, gatilho]);

            /* Refresh automatico. Com ETag, quase sempre custa 304 sem corpo. */
            useEffect(function () {
                var t = window.setInterval(function () {
                    window.Http.limparCache('/dash');
                    setGatilho(function (n) { return n + 1; });
                }, 60000);
                return function () { window.clearInterval(t); };
            }, []);

            var k = useMemo(function () {
                return (resposta && resposta.k) || { t: 0, f: 0, j: 0, a: 0, b: 0, n: 0, lc: 0 };
            }, [resposta]);

            var serie = useMemo(function () {
                return (resposta && resposta.s) || [];
            }, [resposta]);

            var ufs = useMemo(function () {
                return (resposta && resposta.u) || [];
            }, [resposta]);

            return {
                k: k,
                serie: serie,
                ufs: ufs,
                dias: dias,
                periodos: [7, 30, 90],
                dicaPeriodo: 'ultimos ' + dias + ' dias',
                carregando: carregando,
                atualizado: atualizado,
                trocarPeriodo: function (d) {
                    if (d !== dias) { setDias(d); }
                },
                recarregar: function () {
                    window.Http.limparCache('/dash');
                    setGatilho(function (n) { return n + 1; });
                }
            };
        }
    });

}(window.FdReact));
