/* Fila de notificacoes. Um so host para o app inteiro. */
(function (FdReact) {
    'use strict';

    var useState = FdReact.useState;
    var useEffect = FdReact.useEffect;

    FdReact.componente('toast-host', {
        template: [
            '<div class="toasts">',
            '  <div class="toast" ng-repeat="t in v.itens track by t.id" ng-class="\'toast-\' + t.tipo"',
            '       ng-click="v.fechar(t.id)">{{t.texto}}</div>',
            '</div>'
        ].join(''),

        setup: function () {
            var st = useState([]);
            var itens = st[0];
            var setItens = st[1];

            useEffect(function () {
                var timers = [];
                var desinscrever = window.Store.aoToast(function (t) {
                    setItens(function (atual) { return atual.concat(t); });
                    timers.push(window.setTimeout(function () {
                        setItens(function (atual) {
                            return atual.filter(function (x) { return x.id !== t.id; });
                        });
                    }, t.tipo === 'erro' ? 6000 : 3000));
                });
                return function () {
                    desinscrever();
                    timers.forEach(window.clearTimeout);
                };
            }, []);

            return {
                itens: itens,
                fechar: function (id) {
                    setItens(function (atual) {
                        return atual.filter(function (x) { return x.id !== id; });
                    });
                }
            };
        }
    });

}(window.FdReact));
