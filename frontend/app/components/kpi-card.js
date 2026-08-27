/* Cartao de indicador do dashboard. */
(function (FdReact) {
    'use strict';

    var useMemo = FdReact.useMemo;

    FdReact.componente('kpi-card', {
        props: ['titulo', 'valor', 'formato', 'cor', 'dica'],

        template: [
            '<div class="kpi" ng-class="v.classe" title="{{dica}}">',
            '  <div class="kpi-titulo">{{titulo}}</div>',
            '  <div class="kpi-valor">{{v.texto}}</div>',
            '  <div class="kpi-dica" ng-if="dica">{{dica}}</div>',
            '</div>'
        ].join(''),

        setup: function (props) {
            // so reformata quando valor/formato mudam de verdade
            var texto = useMemo(function () {
                var n = props.valor;
                if (n === null || n === undefined) {
                    return '--';
                }
                if (props.formato === 'moeda') {
                    return 'R$ ' + window.Mask.numeroParaMoeda(Number(n));
                }
                if (props.formato === 'compacto' && n >= 1000) {
                    return (n / 1000).toFixed(1).replace('.', ',') + ' mil';
                }
                return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            }, [props.valor, props.formato]);

            return {
                texto: texto,
                classe: 'kpi-' + (props.cor || 'neutro')
            };
        }
    });

}(window.FdReact));
