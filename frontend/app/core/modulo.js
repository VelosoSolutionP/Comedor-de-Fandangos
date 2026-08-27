/* Modulo raiz. Carregado antes de tudo: os demais arquivos so fazem
 * angular.module('fandangos') para pendurar coisas nele. */
(function (angular) {
    'use strict';

    angular.module('fandangos', [])
        // desliga o debug info do AngularJS: menos atributos no DOM,
        // menos memoria e digest mais rapido em grid grande.
        .config(['$compileProvider', function ($compileProvider) {
            $compileProvider.debugInfoEnabled(false);
            $compileProvider.commentDirectivesEnabled(false);
            $compileProvider.cssClassDirectivesEnabled(false);
        }]);

}(window.angular));
