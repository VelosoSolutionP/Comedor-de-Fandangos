/* ============================================================================
 *  data-grid.js  -  tabela paginada.
 *
 *  Recebe os itens JA expandidos do formato colunar (Http.expandirGrid).
 *  Usa `track by` no ng-repeat: sem isso o AngularJS recria toda a <tr> a
 *  cada resposta, mesmo quando 19 das 20 linhas sao identicas.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useMemo = FdReact.useMemo;

    var SITUACOES = { 0: 'Inativo', 1: 'Ativo', 2: 'Bloqueado' };

    FdReact.componente('data-grid', {
        props: ['itens', 'total', 'pagina', 'tamanho', 'carregando'],
        eventos: ['aoAbrir', 'aoExcluir', 'aoPaginar'],

        template: [
            '<div class="grid-wrap">',
            '  <div class="grid-scroll">',
            '  <table class="grid">',
            '    <thead>',
            '      <tr>',
            '        <th class="col-doc">CPF / CNPJ</th>',
            '        <th>Nome / Razao social</th>',
            '        <th class="col-uf">UF</th>',
            '        <th class="col-tp">Tipo</th>',
            '        <th class="col-sit">Situacao</th>',
            '        <th class="col-acoes"></th>',
            '      </tr>',
            '    </thead>',
            '    <tbody ng-class="{esmaecido: carregando}">',
            '      <tr ng-repeat="c in itens track by c.id" ng-dblclick="v.abrir(c)">',
            '        <td class="mono">{{c.doc | fdMask:(c.tp === \'F\' ? \'cpf\' : \'cnpj\')}}</td>',
            '        <td class="nome">{{c.nm}}</td>',
            '        <td class="mono">{{c.uf || \'--\'}}</td>',
            '        <td><span class="tag tag-tp">{{c.tp === \'F\' ? \'PF\' : \'PJ\'}}</span></td>',
            '        <td><span class="tag" ng-class="\'sit-\' + c.sit">{{v.situacao(c.sit)}}</span></td>',
            '        <td class="acoes">',
            '          <button type="button" class="btn-mini" ng-click="v.abrir(c)">Editar</button>',
            '          <button type="button" class="btn-mini btn-perigo" ng-click="v.excluir(c)">Excluir</button>',
            '        </td>',
            '      </tr>',
            '      <tr ng-if="!itens.length && !carregando">',
            '        <td colspan="6" class="vazio">Nenhum cliente encontrado.</td>',
            '      </tr>',
            '    </tbody>',
            '  </table>',
            '  </div>',
            '  <div class="paginacao">',
            '    <span class="contagem">',
            '      {{v.primeiro}}-{{v.ultimo}} de {{total}}',
            '    </span>',
            '    <button type="button" class="btn-mini" ng-disabled="pagina <= 0 || carregando"',
            '            ng-click="v.paginar(pagina - 1)">Anterior</button>',
            '    <span class="pagina-atual">{{pagina + 1}} / {{v.totalPaginas}}</span>',
            '    <button type="button" class="btn-mini" ng-disabled="pagina + 1 >= v.totalPaginas || carregando"',
            '            ng-click="v.paginar(pagina + 1)">Proxima</button>',
            '  </div>',
            '</div>'
        ].join(''),

        setup: function (props, ctx) {
            var total = Number(props.total) || 0;
            var tamanho = Number(props.tamanho) || 20;
            var pagina = Number(props.pagina) || 0;

            var paginacao = useMemo(function () {
                var totalPaginas = Math.max(1, Math.ceil(total / tamanho));
                var primeiro = total === 0 ? 0 : (pagina * tamanho) + 1;
                var ultimo = Math.min(total, (pagina + 1) * tamanho);
                return { totalPaginas: totalPaginas, primeiro: primeiro, ultimo: ultimo };
            }, [total, tamanho, pagina]);

            return {
                totalPaginas: paginacao.totalPaginas,
                primeiro: paginacao.primeiro,
                ultimo: paginacao.ultimo,

                situacao: function (s) {
                    return SITUACOES[s] || '?';
                },
                abrir: function (c) {
                    ctx.emitir('aoAbrir', c);
                },
                excluir: function (c) {
                    ctx.emitir('aoExcluir', c);
                },
                paginar: function (p) {
                    if (p < 0 || p >= paginacao.totalPaginas) {
                        return;
                    }
                    ctx.emitir('aoPaginar', p);
                }
            };
        }
    });

}(window.FdReact));
