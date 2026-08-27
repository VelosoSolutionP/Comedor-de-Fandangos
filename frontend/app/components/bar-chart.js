/* ============================================================================
 *  bar-chart.js  -  grafico de barras em SVG puro.
 *
 *  Chart.js custa ~200 KB. Este arquivo custa ~4 KB, renderiza como markup
 *  (o navegador ja sabe desenhar SVG) e nao precisa de canvas nem de
 *  redimensionamento manual: o viewBox cuida da responsividade.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useMemo = FdReact.useMemo;

    FdReact.componente('bar-chart', {
        props: ['dados', 'titulo', 'altura', 'cor'],

        template: [
            '<div class="chart">',
            '  <div class="chart-titulo">{{titulo}}</div>',
            '  <svg ng-if="v.barras.length" class="chart-svg"',
            '       viewBox="0 0 {{v.largura}} {{v.alturaTotal}}" preserveAspectRatio="none"',
            '       role="img" aria-label="{{titulo}}">',
            '    <g ng-repeat="b in v.barras track by b.k">',
            '      <rect x="{{b.x}}" y="{{b.y}}" width="{{v.larguraBarra}}" height="{{b.h}}"',
            '            rx="2" class="chart-barra" ng-attr-fill="{{v.cor}}">',
            '        <title>{{b.rotulo}}: {{b.valor}}</title>',
            '      </rect>',
            '    </g>',
            '  </svg>',
            '  <div class="chart-eixo" ng-if="v.barras.length">',
            '    <span ng-repeat="b in v.barras track by b.k" class="chart-rotulo">{{b.curto}}</span>',
            '  </div>',
            '  <div class="vazio" ng-if="!v.barras.length">sem dados no periodo</div>',
            '</div>'
        ].join(''),

        setup: function (props) {
            /*
             * dados: [[rotulo, valor], ...]  (formato colunar vindo da API)
             * Recalcula so quando o array muda de referencia.
             */
            var calculado = useMemo(function () {
                var dados = props.dados || [];
                var alturaTotal = Number(props.altura) || 120;
                var largura = 300;
                var vao = 2;

                if (!dados.length) {
                    return { barras: [], largura: largura, alturaTotal: alturaTotal, larguraBarra: 0 };
                }

                var max = 0;
                for (var i = 0; i < dados.length; i++) {
                    var v = Number(dados[i][1]) || 0;
                    if (v > max) { max = v; }
                }
                if (max === 0) { max = 1; }

                var larguraBarra = Math.max(1, (largura / dados.length) - vao);
                var barras = new Array(dados.length);

                for (var j = 0; j < dados.length; j++) {
                    var rotulo = String(dados[j][0]);
                    var valor = Number(dados[j][1]) || 0;
                    var h = Math.max(1, (valor / max) * (alturaTotal - 4));
                    barras[j] = {
                        k: j,
                        x: j * (larguraBarra + vao),
                        y: alturaTotal - h,
                        h: h,
                        valor: valor,
                        rotulo: rotulo,
                        // eixo com no maximo 12 rotulos: mais que isso vira borrao
                        curto: (dados.length <= 12 || j % Math.ceil(dados.length / 12) === 0)
                               ? encurtar(rotulo) : ''
                    };
                }

                return {
                    barras: barras,
                    largura: largura,
                    alturaTotal: alturaTotal,
                    larguraBarra: larguraBarra
                };
            }, [props.dados, props.altura]);

            return {
                barras: calculado.barras,
                largura: calculado.largura,
                alturaTotal: calculado.alturaTotal,
                larguraBarra: calculado.larguraBarra,
                cor: props.cor || '#e07b00'
            };
        }
    });

    /** '2026-08-27' -> '27/08' ; 'SP' -> 'SP' */
    function encurtar(rotulo) {
        if (/^\d{4}-\d{2}-\d{2}/.test(rotulo)) {
            return rotulo.slice(8, 10) + '/' + rotulo.slice(5, 7);
        }
        return rotulo.length > 6 ? rotulo.slice(0, 6) : rotulo;
    }

}(window.FdReact));
