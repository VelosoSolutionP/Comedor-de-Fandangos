/* ============================================================================
 *  mask.js  -  mascaras de campo, sem biblioteca.
 *
 *  Contrato: o MODEL guarda sempre o valor limpo (so digitos). A mascara vive
 *  na VIEW. Assim o payload que sobe para a API ja vai enxuto e o backend
 *  nunca precisa limpar string.
 * ========================================================================== */
(function (window, angular) {
    'use strict';

    function digitos(s) {
        return (s || '').replace(/\D+/g, '');
    }

    var Mask = {
        digitos: digitos,

        cpf: function (v) {
            var d = digitos(v).slice(0, 11);
            if (d.length <= 3) { return d; }
            if (d.length <= 6) { return d.slice(0, 3) + '.' + d.slice(3); }
            if (d.length <= 9) { return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6); }
            return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
        },

        cnpj: function (v) {
            var d = digitos(v).slice(0, 14);
            if (d.length <= 2) { return d; }
            if (d.length <= 5) { return d.slice(0, 2) + '.' + d.slice(2); }
            if (d.length <= 8) { return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5); }
            if (d.length <= 12) {
                return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8);
            }
            return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/'
                 + d.slice(8, 12) + '-' + d.slice(12);
        },

        /** Decide CPF ou CNPJ pela quantidade digitada. */
        cpfCnpj: function (v) {
            var d = digitos(v).slice(0, 14);
            return d.length <= 11 ? Mask.cpf(d) : Mask.cnpj(d);
        },

        telefone: function (v) {
            var d = digitos(v).slice(0, 11);
            if (d.length <= 2) { return d.length ? '(' + d : d; }
            if (d.length <= 6) { return '(' + d.slice(0, 2) + ') ' + d.slice(2); }
            if (d.length <= 10) {
                return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
            }
            return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
        },

        cep: function (v) {
            var d = digitos(v).slice(0, 8);
            return d.length <= 5 ? d : d.slice(0, 5) + '-' + d.slice(5);
        },

        data: function (v) {
            var d = digitos(v).slice(0, 8);
            if (d.length <= 2) { return d; }
            if (d.length <= 4) { return d.slice(0, 2) + '/' + d.slice(2); }
            return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
        },

        /** 1234567 -> 12.345,67  (model guarda centavos como inteiro) */
        moeda: function (v) {
            var d = digitos(v).slice(0, 13);
            if (!d) { return ''; }
            while (d.length < 3) { d = '0' + d; }
            var centavos = d.slice(-2);
            var inteiro = d.slice(0, -2).replace(/^0+(?=\d)/, '');
            return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + centavos;
        },

        /* ---------------------------------------------------- conversores */

        /** '12/03/1990' -> '1990-03-12' (formato que a API espera) */
        dataParaIso: function (v) {
            var d = digitos(v);
            if (d.length !== 8) { return null; }
            var dia = d.slice(0, 2), mes = d.slice(2, 4), ano = d.slice(4);
            var dt = new Date(+ano, +mes - 1, +dia);
            if (dt.getFullYear() !== +ano || dt.getMonth() !== +mes - 1 || dt.getDate() !== +dia) {
                return null;                       // 31/02 nao existe
            }
            return ano + '-' + mes + '-' + dia;
        },

        isoParaData: function (iso) {
            if (!iso || iso.length < 10) { return ''; }
            return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
        },

        /** '12.345,67' -> 12345.67 */
        moedaParaNumero: function (v) {
            var d = digitos(v);
            return d ? (parseInt(d, 10) / 100) : 0;
        },

        numeroParaMoeda: function (n) {
            if (n === null || n === undefined || isNaN(n)) { return ''; }
            return Mask.moeda(String(Math.round(n * 100)));
        },

        aplicar: function (tipo, valor) {
            var fn = Mask[tipo];
            return typeof fn === 'function' ? fn(valor) : (valor || '');
        }
    };

    window.Mask = Mask;

    /* ----------------------------------------------------------------------
     *  <input fd-mask="cpfCnpj" ng-model="...">
     *
     *  O model recebe o valor LIMPO; a view mostra o formatado. O cursor e
     *  reposicionado contando digitos, entao editar no meio do campo nao
     *  joga o cursor para o fim.
     * -------------------------------------------------------------------- */
    angular.module('fandangos').directive('fdMask', function () {
        return {
            restrict: 'A',
            require: 'ngModel',
            link: function (scope, element, attrs, ngModel) {
                var tipo = attrs.fdMask;
                var input = element[0];
                var limparNoModel = attrs.fdMaskLimpo !== 'false';

                function conhecida() {
                    return typeof Mask[tipo] === 'function';
                }

                function formatar(v) {
                    return conhecida() ? Mask[tipo](v) : (v === null || v === undefined ? '' : String(v));
                }

                /*
                 * O tipo pode chegar interpolado (fd-mask="{{mascara}}"). O
                 * atributo PRECISA estar no HTML no momento do compile - por
                 * isso $observe, e nao ng-attr-fd-mask, que so aparece depois
                 * de compilar e nunca ativaria esta diretiva.
                 */
                attrs.$observe('fdMask', function (novo) {
                    if (!novo || novo === tipo) {
                        return;
                    }
                    tipo = novo;
                    ngModel.$viewValue = formatar(ngModel.$modelValue);
                    ngModel.$render();
                });

                // model -> view
                ngModel.$formatters.push(function (v) {
                    if (v === null || v === undefined) { return ''; }
                    return formatar(String(v));
                });

                // view -> model
                ngModel.$parsers.push(function (v) {
                    if (!conhecida()) {
                        return v;                      // sem mascara: passa reto
                    }
                    var bruto = v || '';
                    var posicao = input.selectionStart;
                    var digitosAntes = digitos(bruto.slice(0, posicao)).length;

                    var formatado = formatar(bruto);
                    if (formatado !== bruto) {
                        ngModel.$setViewValue(formatado);
                        ngModel.$render();
                        // recoloca o cursor apos o mesmo numero de digitos
                        var novaPos = 0, contados = 0;
                        while (novaPos < formatado.length && contados < digitosAntes) {
                            if (/\d/.test(formatado.charAt(novaPos))) { contados++; }
                            novaPos++;
                        }
                        try { input.setSelectionRange(novaPos, novaPos); } catch (e) { /* ignora */ }
                    }
                    return limparNoModel ? digitos(formatado) : formatado;
                });
            }
        };
    });

    /** Filtro para exibir valores ja formatados em tabelas: {{ x | fdMask:'cpfCnpj' }} */
    angular.module('fandangos').filter('fdMask', function () {
        return function (valor, tipo) {
            return Mask.aplicar(tipo, valor);
        };
    });

}(window, window.angular));
