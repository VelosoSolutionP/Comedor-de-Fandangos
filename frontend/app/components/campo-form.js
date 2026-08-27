/* ============================================================================
 *  campo-form.js  -  input com label, mascara, erro e estado controlado.
 *
 *  E um componente CONTROLADO no sentido do React: o valor vem por prop e a
 *  mudanca sobe por evento. O truque para casar isso com o ng-model do
 *  AngularJS e guardar o objeto do modelo num useRef - assim a referencia
 *  sobrevive aos renders e o ng-model nao perde o vinculo.
 *
 *  Isso e o que faz o autopreenchimento por CPF/CNPJ funcionar: quando a
 *  resposta do lookup chega, a prop muda e o campo se atualiza sozinho.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useRef = FdReact.useRef;

    var contador = 0;

    FdReact.componente('campo-form', {
        props: ['rotulo', 'valor', 'mascara', 'erro', 'obrigatorio', 'placeholder',
                'maxlength', 'dica', 'desabilitado', 'largura', 'tipo'],
        eventos: ['aoMudar', 'aoSair'],

        template: [
            '<div class="campo" ng-class="[v.classeLargura, {invalido: erro, ocupado: desabilitado}]">',
            '  <label ng-attr-for="{{v.id}}">',
            '    {{rotulo}}<span class="obrig" ng-if="obrigatorio">*</span>',
            '  </label>',
            '  <input ng-attr-id="{{v.id}}"',
            '         ng-attr-type="{{tipo || \'text\'}}"',
            '         ng-model="v.m.txt"',
            '         ng-change="v.mudou()"',
            '         ng-blur="v.saiu()"',
            '         ng-disabled="desabilitado"',
            '         ng-attr-placeholder="{{placeholder}}"',
            '         ng-attr-maxlength="{{maxlength}}"',
            '         fd-mask="{{mascara}}"',
            '         autocomplete="off" spellcheck="false">',
            '  <div class="erro" ng-if="erro">{{erro}}</div>',
            '  <div class="dica" ng-if="dica && !erro">{{dica}}</div>',
            '</div>'
        ].join(''),

        setup: function (props, ctx) {
            // objeto estavel entre renders: o ng-model aponta sempre para ele
            var modelo = useRef(null);
            if (!modelo.current) {
                modelo.current = { txt: '' };
            }

            // ultimo valor visto vindo de fora; evita sobrescrever a digitacao
            var externo = useRef(undefined);
            var id = useRef(null);
            if (!id.current) {
                id.current = 'c' + (++contador);
            }

            var recebido = props.valor === null || props.valor === undefined
                         ? '' : String(props.valor);

            if (recebido !== externo.current) {
                externo.current = recebido;
                modelo.current.txt = recebido;
            }

            return {
                id: id.current,
                m: modelo.current,
                classeLargura: 'campo-' + (props.largura || 'md'),

                mudou: function () {
                    // registra como "ja conhecido" para o sync acima nao reverter
                    externo.current = modelo.current.txt;
                    ctx.emitir('aoMudar', modelo.current.txt);
                },
                saiu: function () {
                    ctx.emitir('aoSair', modelo.current.txt);
                }
            };
        }
    });

}(window.FdReact));
