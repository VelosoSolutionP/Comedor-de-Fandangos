/* ============================================================================
 *  routes/login.js
 * ========================================================================== */
(function (FdReact) {
    'use strict';

    var useState = FdReact.useState;
    var useRef = FdReact.useRef;
    var useEffect = FdReact.useEffect;

    FdReact.componente('route-login', {
        template: [
            '<div class="login-fundo">',
            '  <form class="login-caixa" ng-submit="v.entrar()" novalidate>',
            '    <div class="login-marca">',
            '      <div class="login-icone">*</div>',
            '      <h1>comedores-de-fandangos</h1>',
            '      <p>gestao de clientes</p>',
            '    </div>',

            '    <label for="lg-user">Usuario</label>',
            '    <input id="lg-user" type="text" ng-model="v.f.usuario" ng-disabled="v.ocupado"',
            '           autocomplete="username" autofocus spellcheck="false">',

            '    <label for="lg-pass">Senha</label>',
            '    <input id="lg-pass" type="password" ng-model="v.f.senha" ng-disabled="v.ocupado"',
            '           autocomplete="current-password">',

            '    <div class="erro-caixa" ng-if="v.erro">{{v.erro}}</div>',

            '    <button type="submit" class="btn btn-primario" ng-disabled="v.ocupado">',
            '      {{v.ocupado ? "Entrando..." : "Entrar"}}',
            '    </button>',

            '    <div class="login-dica">',
            '      <code>admin</code> / <code>fandangos@123</code>',
            '    </div>',
            '  </form>',
            '</div>'
        ].join(''),

        setup: function () {
            var e1 = useState('');
            var erro = e1[0];
            var setErro = e1[1];

            var o1 = useState(false);
            var ocupado = o1[0];
            var setOcupado = o1[1];

            // objeto estavel para o ng-model dos dois inputs
            var f = useRef(null);
            if (!f.current) {
                f.current = { usuario: '', senha: '' };
            }

            useEffect(function () {
                document.title = 'Entrar | comedores-de-fandangos';
            }, []);

            function entrar() {
                if (ocupado) {
                    return;
                }
                var u = (f.current.usuario || '').trim();
                var p = f.current.senha || '';
                if (!u || !p) {
                    setErro('Informe usuario e senha.');
                    return;
                }

                setErro('');
                setOcupado(true);

                window.Http.login(u, p)
                    .then(function (dados) {
                        window.Store.entrar(dados);
                        var destino = window.Store.destinoPendente || '/dashboard';
                        window.Store.destinoPendente = null;
                        window.Store.ok('Bem-vindo, ' + dados.n + '!');
                        window.Router.ir(destino);
                    })
                    .catch(function (err) {
                        f.current.senha = '';
                        setErro(window.Http.mensagem(err, 'Nao foi possivel entrar.'));
                    })
                    .finally(function () {
                        setOcupado(false);
                    });
            }

            return {
                f: f.current,
                erro: erro,
                ocupado: ocupado,
                entrar: entrar
            };
        }
    });

}(window.FdReact));
