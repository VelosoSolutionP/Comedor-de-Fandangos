/* ============================================================================
 *  routes/produto-form.js  -  cadastro/edicao de produto.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useState = FdReact.useState;
    var useEffect = FdReact.useEffect;
    var useRef = FdReact.useRef;

    var UNIDADES = ['UN', 'PCT', 'CX', 'FD', 'KG', 'G', 'L', 'ML'];

    var VAZIO = {
        id: null, v: null, sku: '', nm: '', cat: '', un: 'UN',
        prTxt: '', cuTxt: '', pe: '', est: '0', min: '0', sit: '1'
    };

    FdReact.componente('route-produto-form', {
        template: [
            '<div class="pagina">',
            '  <div class="pagina-cabecalho">',
            '    <h2>{{v.titulo}}</h2>',
            '    <button type="button" class="btn-mini" ng-click="v.voltar()">Voltar</button>',
            '  </div>',

            '  <div class="carregando" ng-if="v.carregando">carregando produto...</div>',

            '  <form class="form" ng-if="!v.carregando" ng-submit="v.salvar()" novalidate>',
            '    <fieldset>',
            '      <legend>Identificacao</legend>',
            '      <div class="linha">',
            '        <campo-form rotulo="\'SKU\'" valor="v.f.sku" obrigatorio="true"',
            '                    erro="v.erros.sku" largura="\'sm\'" maxlength="20"',
            '                    dica="\'letras, numeros e hifen\'"',
            '                    ao-mudar="v.setSku($e)"></campo-form>',
            '        <campo-form rotulo="\'Nome do produto\'" valor="v.f.nm" obrigatorio="true"',
            '                    erro="v.erros.nm" largura="\'lg\'" maxlength="150"',
            '                    ao-mudar="v.set(\'nm\', $e)"></campo-form>',
            '        <div class="campo campo-sm">',
            '          <label for="pf-sit">Situacao</label>',
            '          <select id="pf-sit" ng-model="v.f.sit" ng-change="v.tocar()">',
            '            <option value="1">Ativo</option>',
            '            <option value="0">Inativo</option>',
            '            <option value="2">Descontinuado</option>',
            '          </select>',
            '        </div>',
            '      </div>',
            '      <div class="linha">',
            '        <campo-form rotulo="\'Categoria\'" valor="v.f.cat" largura="\'md\'" maxlength="40"',
            '                    dica="\'em branco = Geral\'"',
            '                    ao-mudar="v.set(\'cat\', $e)"></campo-form>',
            '        <div class="campo campo-xs">',
            '          <label for="pf-un">Unidade</label>',
            '          <select id="pf-un" ng-model="v.f.un" ng-change="v.tocar()">',
            '            <option ng-repeat="u in v.unidades track by u" value="{{u}}">{{u}}</option>',
            '          </select>',
            '        </div>',
            '        <campo-form rotulo="\'Peso (g)\'" valor="v.f.pe" largura="\'xs\'" maxlength="6"',
            '                    erro="v.erros.pe" ao-mudar="v.set(\'pe\', $e)"></campo-form>',
            '      </div>',
            '    </fieldset>',

            '    <fieldset>',
            '      <legend>Preco e estoque</legend>',
            '      <div class="linha">',
            '        <campo-form rotulo="\'Preco de venda\'" valor="v.f.prTxt" mascara="\'moeda\'"',
            '                    obrigatorio="true" erro="v.erros.pr" largura="\'sm\'" dica="\'R$\'"',
            '                    ao-mudar="v.set(\'prTxt\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Custo\'" valor="v.f.cuTxt" mascara="\'moeda\'"',
            '                    erro="v.erros.cu" largura="\'sm\'" dica="\'R$\'"',
            '                    ao-mudar="v.set(\'cuTxt\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Estoque atual\'" valor="v.f.est" largura="\'xs\'" maxlength="7"',
            '                    erro="v.erros.est" ao-mudar="v.set(\'est\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Estoque minimo\'" valor="v.f.min" largura="\'xs\'" maxlength="7"',
            '                    erro="v.erros.min" dica="\'gera alerta\'"',
            '                    ao-mudar="v.set(\'min\', $e)"></campo-form>',
            '      </div>',

            '      <div class="aviso aviso-dup" ng-if="v.margemRuim">',
            '        Custo maior ou igual ao preco de venda: a margem fica negativa.',
            '      </div>',
            '      <div class="dica" ng-if="v.margem && !v.margemRuim">',
            '        Margem bruta: {{v.margem}}',
            '      </div>',
            '    </fieldset>',

            '    <div class="acoes-form">',
            '      <button type="submit" class="btn btn-primario" ng-disabled="v.salvando">',
            '        {{v.salvando ? "Salvando..." : "Salvar"}}',
            '      </button>',
            '      <button type="button" class="btn" ng-click="v.voltar()">Cancelar</button>',
            '    </div>',
            '  </form>',
            '</div>'
        ].join(''),

        setup: function () {
            var params = (window.Router.atual && window.Router.atual.params) || {};
            var idRota = params.id === 'novo' ? null : Number(params.id);

            var f = useRef(null);
            if (!f.current) {
                f.current = angular.extend({}, VAZIO);
            }

            var r1 = useState(0);
            var setRev = r1[1];

            var e1 = useState({});
            var erros = e1[0];
            var setErros = e1[1];

            var c1 = useState(!!idRota);
            var carregando = c1[0];
            var setCarregando = c1[1];

            var s1 = useState(false);
            var salvando = s1[0];
            var setSalvando = s1[1];

            function tocar() {
                setRev(function (n) { return n + 1; });
            }

            useEffect(function () {
                if (!idRota) {
                    return undefined;
                }
                var vivo = true;
                window.Http.produto(idRota)
                    .then(function (p) {
                        if (!vivo) { return; }
                        f.current = {
                            id: p.id, v: p.v, sku: p.sku || '', nm: p.nm || '',
                            cat: p.cat || '', un: p.un || 'UN',
                            prTxt: window.Mask.numeroParaMoeda(p.pr || 0),
                            cuTxt: window.Mask.numeroParaMoeda(p.cu || 0),
                            pe: p.pe == null ? '' : String(p.pe),
                            est: String(p.est == null ? 0 : p.est),
                            min: String(p.min == null ? 0 : p.min),
                            sit: String(p.sit == null ? 1 : p.sit)
                        };
                        setCarregando(false);
                    })
                    .catch(function (err) {
                        if (!vivo) { return; }
                        setCarregando(false);
                        window.Store.erro(window.Http.mensagem(err, 'Produto nao encontrado.'));
                        window.Router.ir('/produtos');
                    });
                return function () { vivo = false; };
            }, [idRota]);

            function validar(d) {
                var e = {};
                if (!/^[A-Za-z0-9-]{3,20}$/.test(d.sku || '')) {
                    e.sku = 'De 3 a 20 caracteres: letras, numeros e hifen';
                }
                if (!d.nm || d.nm.trim().length < 3) {
                    e.nm = 'Informe o nome do produto';
                }
                if (window.Mask.moedaParaNumero(d.prTxt) <= 0) {
                    e.pr = 'Informe o preco de venda';
                }
                if (d.pe !== '' && !(Number(d.pe) > 0)) {
                    e.pe = 'Peso deve ser maior que zero';
                }
                if (d.est !== '' && Number(d.est) < 0) {
                    e.est = 'Nao pode ser negativo';
                }
                if (d.min !== '' && Number(d.min) < 0) {
                    e.min = 'Nao pode ser negativo';
                }
                return e;
            }

            function salvar() {
                if (salvando) {
                    return;
                }
                var d = f.current;
                var e = validar(d);
                if (Object.keys(e).length) {
                    setErros(e);
                    window.Store.erro('Corrija os campos destacados.');
                    return;
                }
                setErros({});
                setSalvando(true);

                var dto = {
                    sku: d.sku.toUpperCase(),
                    nm: d.nm.trim(),
                    un: d.un,
                    pr: window.Mask.moedaParaNumero(d.prTxt),
                    cu: window.Mask.moedaParaNumero(d.cuTxt),
                    est: Number(d.est || 0),
                    min: Number(d.min || 0),
                    sit: Number(d.sit)
                };
                if (d.id) { dto.id = d.id; dto.v = d.v; }
                if (d.cat) { dto.cat = d.cat.trim(); }
                if (d.pe) { dto.pe = Number(d.pe); }

                window.Http.salvarProduto(dto)
                    .then(function () {
                        window.Store.ok(d.id ? 'Produto atualizado.' : 'Produto cadastrado.');
                        window.Router.ir('/produtos');
                    })
                    .catch(function (err) {
                        setSalvando(false);
                        if (window.Http.codigo(err) === 'SKU_DUPLICADO') {
                            setErros({ sku: 'Este SKU ja existe' });
                        }
                        window.Store.erro(window.Http.mensagem(err, 'Nao foi possivel salvar.'));
                    });
            }

            var preco = window.Mask.moedaParaNumero(f.current.prTxt);
            var custo = window.Mask.moedaParaNumero(f.current.cuTxt);

            return {
                f: f.current,
                erros: erros,
                carregando: carregando,
                salvando: salvando,
                unidades: UNIDADES,
                titulo: idRota ? 'Editar produto' : 'Novo produto',

                margemRuim: custo > 0 && preco > 0 && custo >= preco,
                margem: (custo > 0 && preco > custo)
                    ? (((preco - custo) / preco) * 100).toFixed(1).replace('.', ',') + '%'
                    : '',

                set: function (campo, valor) { f.current[campo] = valor; tocar(); },
                setSku: function (valor) { f.current.sku = (valor || '').toUpperCase(); tocar(); },
                tocar: tocar,
                salvar: salvar,
                voltar: function () { window.Router.ir('/produtos'); }
            };
        }
    });

}(window.FdReact));
