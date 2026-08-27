/* ============================================================================
 *  routes/cliente-form.js  -  cadastro/edicao de cliente.
 *
 *  Autopreenchimento: assim que o CPF/CNPJ digitado passa no digito
 *  verificador, dispara UM request para /api/lookup. A resposta vem do Redis
 *  (~1ms) na maioria das vezes. Se o documento ja for de um cliente
 *  existente, o formulario avisa e oferece abrir o cadastro em vez de criar
 *  um duplicado.
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useState = FdReact.useState;
    var useEffect = FdReact.useEffect;
    var useRef = FdReact.useRef;

    var VAZIO = {
        id: null, v: null, tp: 'F', doc: '', nm: '', fa: '', em: '', tel: '',
        nascBr: '', sit: '1', cep: '', lgr: '', num: '', cpl: '', bai: '',
        cid: '', uf: '', limTxt: ''
    };

    FdReact.componente('route-cliente-form', {
        template: [
            '<div class="pagina">',
            '  <div class="pagina-cabecalho">',
            '    <h2>{{v.titulo}}</h2>',
            '    <div>',
            '      <button type="button" class="btn-mini" ng-click="v.voltar()">Voltar</button>',
            '    </div>',
            '  </div>',

            '  <div class="carregando" ng-if="v.carregando">carregando cadastro...</div>',

            '  <form class="form" ng-if="!v.carregando" ng-submit="v.salvar()" novalidate>',

            '    <fieldset>',
            '      <legend>Identificacao</legend>',
            '      <div class="linha">',
            '        <campo-form rotulo="\'CPF / CNPJ\'" valor="v.f.doc" mascara="\'cpfCnpj\'"',
            '                    obrigatorio="true" erro="v.erros.doc" largura="\'md\'"',
            '                    desabilitado="v.buscando"',
            '                    dica="v.dicaDoc"',
            '                    ao-mudar="v.setDoc($e)"></campo-form>',
            '        <div class="campo campo-sm">',
            '          <label>Tipo</label>',
            '          <div class="tipo-chip" ng-class="v.f.tp === \'J\' ? \'chip-pj\' : \'chip-pf\'">',
            '            {{v.f.tp === \'J\' ? \'Pessoa juridica\' : \'Pessoa fisica\'}}',
            '          </div>',
            '        </div>',
            '        <div class="campo campo-sm">',
            '          <label for="cf-sit">Situacao</label>',
            '          <select id="cf-sit" ng-model="v.f.sit" ng-change="v.tocar()">',
            '            <option value="1">Ativo</option>',
            '            <option value="0">Inativo</option>',
            '            <option value="2">Bloqueado</option>',
            '          </select>',
            '        </div>',
            '      </div>',

            '      <div class="aviso aviso-dup" ng-if="v.duplicado">',
            '        Ja existe cliente com este documento.',
            '        <button type="button" class="btn-mini" ng-click="v.abrirExistente()">Abrir cadastro</button>',
            '      </div>',

            '      <div class="linha">',
            '        <campo-form rotulo="v.rotuloNome" valor="v.f.nm" obrigatorio="true"',
            '                    erro="v.erros.nm" largura="\'lg\'" maxlength="150"',
            '                    ao-mudar="v.set(\'nm\', $e)"></campo-form>',
            '        <campo-form ng-if="v.f.tp === \'J\'" rotulo="\'Nome fantasia\'" valor="v.f.fa"',
            '                    largura="\'md\'" maxlength="150"',
            '                    ao-mudar="v.set(\'fa\', $e)"></campo-form>',
            '      </div>',

            '      <div class="linha">',
            '        <campo-form rotulo="\'E-mail\'" valor="v.f.em" erro="v.erros.em" tipo="\'email\'"',
            '                    largura="\'md\'" maxlength="120" ao-mudar="v.set(\'em\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Telefone\'" valor="v.f.tel" mascara="\'telefone\'"',
            '                    erro="v.erros.tel" largura="\'sm\'" ao-mudar="v.set(\'tel\', $e)"></campo-form>',
            '        <campo-form rotulo="v.rotuloData" valor="v.f.nascBr" mascara="\'data\'"',
            '                    erro="v.erros.nascBr" largura="\'sm\'"',
            '                    ao-mudar="v.set(\'nascBr\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Limite de credito\'" valor="v.f.limTxt" mascara="\'moeda\'"',
            '                    erro="v.erros.lim" largura="\'sm\'" dica="\'R$\'"',
            '                    ao-mudar="v.set(\'limTxt\', $e)"></campo-form>',
            '      </div>',
            '    </fieldset>',

            '    <fieldset>',
            '      <legend>Endereco</legend>',
            '      <div class="linha">',
            '        <campo-form rotulo="\'CEP\'" valor="v.f.cep" mascara="\'cep\'" erro="v.erros.cep"',
            '                    largura="\'sm\'" ao-mudar="v.set(\'cep\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Logradouro\'" valor="v.f.lgr" largura="\'lg\'" maxlength="150"',
            '                    ao-mudar="v.set(\'lgr\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Numero\'" valor="v.f.num" largura="\'xs\'" maxlength="10"',
            '                    ao-mudar="v.set(\'num\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Complemento\'" valor="v.f.cpl" largura="\'sm\'" maxlength="60"',
            '                    ao-mudar="v.set(\'cpl\', $e)"></campo-form>',
            '      </div>',
            '      <div class="linha">',
            '        <campo-form rotulo="\'Bairro\'" valor="v.f.bai" largura="\'md\'" maxlength="80"',
            '                    ao-mudar="v.set(\'bai\', $e)"></campo-form>',
            '        <campo-form rotulo="\'Cidade\'" valor="v.f.cid" largura="\'md\'" maxlength="80"',
            '                    ao-mudar="v.set(\'cid\', $e)"></campo-form>',
            '        <div class="campo campo-xs" ng-class="{invalido: v.erros.uf}">',
            '          <label for="cf-uf">UF</label>',
            '          <select id="cf-uf" ng-model="v.f.uf" ng-change="v.tocar()">',
            '            <option value=""></option>',
            '            <option ng-repeat="u in v.ufs track by u" value="{{u}}">{{u}}</option>',
            '          </select>',
            '          <div class="erro" ng-if="v.erros.uf">{{v.erros.uf}}</div>',
            '        </div>',
            '      </div>',
            '    </fieldset>',

            '    <div class="acoes-form">',
            '      <button type="submit" class="btn btn-primario" ng-disabled="v.salvando">',
            '        {{v.salvando ? "Salvando..." : "Salvar"}}',
            '      </button>',
            '      <button type="button" class="btn" ng-click="v.voltar()">Cancelar</button>',
            '      <span class="origem" ng-if="v.origem">{{v.origem}}</span>',
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

            var b1 = useState(false);
            var buscando = b1[0];
            var setBuscando = b1[1];

            var d1 = useState(null);
            var duplicado = d1[0];
            var setDuplicado = d1[1];

            var o1 = useState('');
            var origem = o1[0];
            var setOrigem = o1[1];

            var ultimoDoc = useRef('');

            function tocar() {
                setRev(function (n) { return n + 1; });
            }

            /* ---------------------------------------------- carga da edicao */
            useEffect(function () {
                if (!idRota) {
                    return undefined;
                }
                var vivo = true;
                window.Http.cliente(idRota)
                    .then(function (c) {
                        if (!vivo) { return; }
                        f.current = {
                            id: c.id,
                            v: c.v,
                            tp: c.tp || 'F',
                            doc: c.doc || '',
                            nm: c.nm || '',
                            fa: c.fa || '',
                            em: c.em || '',
                            tel: c.tel || '',
                            nascBr: window.Mask.isoParaData(c.nasc),
                            sit: String(c.sit === undefined ? 1 : c.sit),
                            cep: c.cep || '',
                            lgr: c.lgr || '',
                            num: c.num || '',
                            cpl: c.cpl || '',
                            bai: c.bai || '',
                            cid: c.cid || '',
                            uf: c.uf || '',
                            limTxt: window.Mask.numeroParaMoeda(c.lim || 0)
                        };
                        ultimoDoc.current = f.current.doc;
                        setCarregando(false);
                    })
                    .catch(function (err) {
                        if (!vivo) { return; }
                        setCarregando(false);
                        window.Store.erro(window.Http.mensagem(err, 'Cadastro nao encontrado.'));
                        window.Router.ir('/clientes');
                    });
                return function () { vivo = false; };
            }, [idRota]);

            /* ------------------------------------------- autopreenchimento */
            function consultarDocumento(doc) {
                setBuscando(true);
                setOrigem('');
                window.Http.lookup(doc)
                    .then(function (r) {
                        setBuscando(false);
                        if (!r || !r.ok) {
                            setDuplicado(null);
                            setOrigem('documento nao encontrado nas bases - preencha manualmente');
                            return;
                        }
                        setDuplicado(r.dup ? (r.id || true) : null);
                        aplicarLookup(r);
                        setOrigem(r.src === 'db' ? 'dados do cadastro existente'
                                : r.src === 'rf' ? 'dados da base publica'
                                : 'dados da consulta externa');
                        tocar();
                    })
                    .catch(function () {
                        setBuscando(false);
                        setOrigem('');
                    });
            }

            /** So preenche campo VAZIO: nunca sobrescreve o que o usuario digitou. */
            function aplicarLookup(r) {
                var alvo = f.current;
                function por(campo, valor) {
                    if (valor !== null && valor !== undefined && valor !== '' && !alvo[campo]) {
                        alvo[campo] = String(valor);
                    }
                }
                if (r.tipo) {
                    alvo.tp = r.tipo;
                }
                por('nm', r.nome);
                por('fa', r.fantasia);
                por('em', r.email);
                por('tel', r.tel);
                por('cep', r.cep);
                por('lgr', r.lgr);
                por('num', r.num);
                por('bai', r.bai);
                por('cid', r.cid);
                por('uf', r.uf);
                if (!alvo.nascBr && r.nasc) {
                    alvo.nascBr = window.Mask.isoParaData(String(r.nasc));
                }
            }

            function setDoc(valor) {
                f.current.doc = valor;
                var tipo = window.Validar.tipoDocumento(valor);
                f.current.tp = tipo || (valor.length > 11 ? 'J' : 'F');

                if (tipo && valor !== ultimoDoc.current) {
                    ultimoDoc.current = valor;
                    consultarDocumento(valor);
                } else if (!tipo) {
                    setDuplicado(null);
                    setOrigem('');
                }
                tocar();
            }

            /* ------------------------------------------------------ salvar */
            function salvar() {
                if (salvando) {
                    return;
                }
                var d = f.current;
                var checagem = window.Validar.formularioCliente({
                    doc: d.doc, nm: d.nm, em: d.em, tel: d.tel, cep: d.cep,
                    uf: d.uf, nascBr: d.nascBr,
                    limNum: window.Mask.moedaParaNumero(d.limTxt)
                });

                if (!checagem.ok) {
                    setErros(checagem.erros);
                    window.Store.erro('Corrija os campos destacados.');
                    return;
                }
                if (!d.id && duplicado) {
                    window.Store.erro('Documento ja cadastrado. Abra o cadastro existente.');
                    return;
                }
                setErros({});
                setSalvando(true);

                // payload enxuto: campo vazio nao viaja
                var dto = { tp: d.tp, doc: d.doc, nm: d.nm.trim(), sit: Number(d.sit) };
                if (d.id) { dto.id = d.id; dto.v = d.v; }
                if (d.fa) { dto.fa = d.fa.trim(); }
                if (d.em) { dto.em = d.em.trim().toLowerCase(); }
                if (d.tel) { dto.tel = d.tel; }
                if (d.nascBr) { dto.nasc = window.Mask.dataParaIso(d.nascBr); }
                if (d.cep) { dto.cep = d.cep; }
                if (d.lgr) { dto.lgr = d.lgr.trim(); }
                if (d.num) { dto.num = d.num.trim(); }
                if (d.cpl) { dto.cpl = d.cpl.trim(); }
                if (d.bai) { dto.bai = d.bai.trim(); }
                if (d.cid) { dto.cid = d.cid.trim(); }
                if (d.uf) { dto.uf = d.uf; }
                var lim = window.Mask.moedaParaNumero(d.limTxt);
                if (lim > 0) { dto.lim = lim; }

                window.Http.salvarCliente(dto)
                    .then(function () {
                        window.Store.ok(d.id ? 'Cadastro atualizado.' : 'Cliente cadastrado.');
                        window.Router.ir('/clientes');
                    })
                    .catch(function (err) {
                        setSalvando(false);
                        var cod = window.Http.codigo(err);
                        if (cod === 'DOC_DUPLICADO') {
                            setErros({ doc: 'Documento ja cadastrado' });
                        } else if (cod === 'VERSAO_CONFLITO') {
                            window.Store.erro('Outro usuario alterou este cadastro. Recarregue a tela.');
                            return;
                        }
                        window.Store.erro(window.Http.mensagem(err, 'Nao foi possivel salvar.'));
                    });
            }

            return {
                f: f.current,
                erros: erros,
                ufs: window.Validar.ufs,
                carregando: carregando,
                salvando: salvando,
                buscando: buscando,
                duplicado: duplicado,
                origem: origem,

                titulo: idRota ? 'Editar cliente' : 'Novo cliente',
                rotuloNome: f.current.tp === 'J' ? 'Razao social' : 'Nome completo',
                rotuloData: f.current.tp === 'J' ? 'Data de abertura' : 'Data de nascimento',
                dicaDoc: buscando ? 'consultando...' : 'a consulta e automatica ao completar o documento',

                set: function (campo, valor) {
                    f.current[campo] = valor;
                    tocar();
                },
                setDoc: setDoc,
                tocar: tocar,
                salvar: salvar,
                voltar: function () {
                    window.Router.ir('/clientes');
                },
                abrirExistente: function () {
                    if (typeof duplicado === 'number') {
                        window.Router.ir('/clientes/' + duplicado);
                    } else {
                        window.Router.ir('/clientes?q=' + f.current.doc);
                    }
                }
            };
        }
    });

}(window.FdReact));
