/* ============================================================================
 *  app.e2e.js  -  integracao do front, de ponta a ponta, sem navegador.
 *
 *    NODE_PATH=<dir com jsdom> node frontend/test/app.e2e.js [url]
 *    (padrao: http://127.0.0.1:8081)
 *
 *  Carrega o index.html num DOM real (jsdom), deixa o AngularJS fazer o
 *  bootstrap e exercita o fluxo do usuario contra a API DE VERDADE:
 *  login -> dashboard -> lista -> formulario com autopreenchimento -> logout.
 *
 *  Tudo e feito por EVENTO DE DOM (digitar, submeter, clicar), nunca mexendo
 *  no $scope: o app roda com debugInfoEnabled(false) por performance, e nesse
 *  modo angular.element(el).scope() nao existe. Testar pelo DOM tambem e mais
 *  proximo do que o usuario faz.
 *
 *  Requer jsdom:  npm install jsdom
 * ========================================================================== */
'use strict';

const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.argv[2] || 'http://127.0.0.1:8081';
const USUARIO = 'admin';
const SENHA = 'fandangos@123';

let ok = 0;
const falhas = [];

function chk(nome, condicao, detalhe) {
    if (condicao) {
        ok++;
        console.log('  ok    ' + nome + (detalhe ? '  ' + detalhe : ''));
    } else {
        falhas.push(nome + (detalhe ? ' -> ' + detalhe : ''));
        console.log('  FALHA ' + nome + (detalhe ? '  ' + detalhe : ''));
    }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperar(cond, prazoMs, intervalo) {
    const fim = Date.now() + (prazoMs || 15000);
    while (Date.now() < fim) {
        try {
            if (cond()) { return true; }
        } catch (e) { /* ainda montando */ }
        await dormir(intervalo || 120);
    }
    return false;
}

(async function () {
    console.log('== comedores-de-fandangos :: e2e do front em ' + BASE + ' ==');

    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => {
        if (!/Not implemented/.test(e.message)) { console.log('  [jsdom] ' + e.message); }
    });

    const dom = await JSDOM.fromURL(BASE + '/', {
        runScripts: 'dangerously',
        resources: 'usable',
        pretendToBeVisual: true,
        virtualConsole: vc
    });

    const win = dom.window;
    const doc = win.document;
    const $ = (sel) => doc.querySelector(sel);
    const $$ = (sel) => Array.from(doc.querySelectorAll(sel));
    const texto = (sel) => (($(sel) || {}).textContent || '').trim();

    win.confirm = () => true;   // jsdom nao implementa

    /** Digita num input como um usuario: o AngularJS ouve o evento 'input'. */
    function digitar(input, valor) {
        input.value = valor;
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        input.dispatchEvent(new win.Event('change', { bubbles: true }));
    }

    function submeter(form) {
        form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    }

    function clicar(el) {
        el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    try {
        // ------------------------------------------------------- bootstrap
        const subiu = await esperar(() => win.FdReact && win.Router && win.Store && win.Http, 25000);
        chk('modulos globais carregados', subiu);
        if (!subiu) { throw new Error('os scripts nao carregaram'); }

        chk('app-root montou no DOM', await esperar(() => !!$('.app'), 15000));

        // ----------------------------------------------------------- login
        chk('rota /login renderizou', await esperar(() => !!$('.login-caixa'), 15000), win.location.hash);
        chk('nao esta autenticado ainda', win.Store.autenticado() === false);

        digitar($('#lg-user'), USUARIO);
        digitar($('#lg-pass'), SENHA);
        submeter($('.login-caixa'));

        chk('login autenticou', await esperar(() => win.Store.autenticado(), 25000));
        chk('token guardado na sessao', ((win.Store.sessao || {}).token || '').length > 20);
        chk('perfil admin veio do token', win.Store.sessao.perfil === 9, 'perfil=' + win.Store.sessao.perfil);
        chk('nome veio da API', win.Store.sessao.nome === 'Administrador Geral', win.Store.sessao.nome);

        // ------------------------------------------------------- dashboard
        chk('foi para o dashboard', await esperar(() => win.location.hash === '#/dashboard', 15000),
            win.location.hash);
        chk('topbar aparece logado', await esperar(() => !!$('.topbar'), 10000));
        chk('nome do usuario na topbar', texto('.usuario-nome') === 'Administrador Geral',
            '"' + texto('.usuario-nome') + '"');

        chk('7 KPIs renderizados', await esperar(() => $$('.kpi').length >= 7, 25000),
            $$('.kpi').length + ' cartoes');
        // os cartoes aparecem antes da resposta chegar (mostrando "--"),
        // entao espera o valor virar numero em vez de checar na hora
        chk('KPI de total com numero real',
            await esperar(() => /\d/.test(texto('.kpi .kpi-valor')), 25000),
            '"' + texto('.kpi .kpi-valor') + '"');
        chk('KPI de moeda formatado',
            await esperar(() => /R\$\s*[\d.]+,\d{2}/.test(doc.body.textContent), 20000),
            (doc.body.textContent.match(/R\$\s*[\d.,]+/) || [''])[0]);
        chk('grafico SVG desenhou barras',
            await esperar(() => $$('.chart svg rect.chart-barra').length > 0, 25000),
            $$('.chart svg rect.chart-barra').length + ' barras');

        // --------------------------------------------------------- clientes
        win.location.hash = '#/clientes';
        chk('grid de clientes carregou',
            await esperar(() => $$('table.grid tbody tr').length > 1, 25000),
            $$('table.grid tbody tr').length + ' linhas');

        const celulas = $$('table.grid tbody tr td');
        const docMascarado = celulas.length ? celulas[0].textContent.trim() : '';
        chk('documento exibido com mascara',
            /^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(docMascarado),
            '"' + docMascarado + '"');
        chk('UF com 2 letras (nao truncada)',
            /^[A-Z]{2}$|^--$/.test(celulas.length > 2 ? celulas[2].textContent.trim() : ''),
            '"' + (celulas.length > 2 ? celulas[2].textContent.trim() : '') + '"');

        const totalAntes = texto('.contagem');
        chk('paginacao mostra o total', /de \d{3,}/.test(totalAntes), '"' + totalAntes + '"');

        // busca com debounce + cancelamento de request
        digitar($('.busca'), 'fandangos');
        const buscou = await esperar(() => {
            const t = texto('.contagem');
            return /de \d+/.test(t) && t !== totalAntes;
        }, 25000);
        chk('busca com debounce filtrou', buscou, '"' + texto('.contagem') + '"');

        // paginacao
        const btnProxima = $$('.paginacao button').find((b) => /Proxima/.test(b.textContent));
        const primeiroIdAntes = ($$('table.grid tbody tr td')[0] || {}).textContent;
        if (btnProxima && !btnProxima.disabled) {
            clicar(btnProxima);
            const paginou = await esperar(
                () => (($$('table.grid tbody tr td')[0] || {}).textContent) !== primeiroIdAntes, 20000);
            chk('paginacao troca o conteudo', paginou);
        } else {
            chk('paginacao troca o conteudo', true, '(so 1 pagina no filtro)');
        }

        // ------------------------------------------- formulario + lookup
        win.location.hash = '#/clientes/novo';
        chk('formulario de novo cliente abriu', await esperar(() => !!$('.form'), 25000));

        const inputDoc = $('.form .campo input');
        chk('campo de documento existe', !!inputDoc);

        // digita o documento de um cliente que JA existe: precisa avisar duplicidade
        digitar(inputDoc, docMascarado);
        chk('mascara aplicada no campo', inputDoc.value === docMascarado,
            '"' + inputDoc.value + '"');

        const ehPJ = docMascarado.indexOf('/') >= 0;
        chk('tipo derivado do documento',
            await esperar(() => /Pessoa (fisica|juridica)/.test(texto('.tipo-chip')), 10000),
            '"' + texto('.tipo-chip') + '"');
        chk('tipo correto para o documento',
            texto('.tipo-chip') === (ehPJ ? 'Pessoa juridica' : 'Pessoa fisica'));

        const avisou = await esperar(() => !!$('.aviso-dup'), 25000);
        chk('lookup avisou documento ja cadastrado', avisou);
        chk('autopreencheu o nome a partir do lookup',
            ($$('.form .campo input')[1] || {}).value.length > 2,
            '"' + (($$('.form .campo input')[1] || {}).value || '') + '"');
        chk('mostra a origem do dado', /cadastro|base|consulta/.test(texto('.origem')),
            '"' + texto('.origem') + '"');

        // DV invalido: nao consulta, nao marca duplicidade
        digitar(inputDoc, '529.982.247-24');
        const limpou = await esperar(() => !$('.aviso-dup'), 10000);
        chk('DV invalido nao vira duplicado', limpou);

        // salvar com documento invalido tem que barrar no cliente
        submeter($('.form'));
        const barrou = await esperar(() => !!$('.campo.invalido .erro'), 10000);
        chk('validacao do cliente barrou o envio', barrou, '"' + texto('.campo.invalido .erro') + '"');

        // --------------------------------------------------------- logout
        const btnSair = $$('.usuario button').find((b) => /Sair/.test(b.textContent));
        chk('botao Sair existe', !!btnSair);
        clicar(btnSair);
        chk('logout limpou a sessao', await esperar(() => !win.Store.autenticado(), 10000));
        chk('voltou para a tela de login', await esperar(() => !!$('.login-caixa'), 15000));
        chk('storage foi limpo', !win.localStorage.getItem('fdg.sessao'));

    } catch (e) {
        falhas.push('excecao: ' + e.message);
        console.log('  ERRO ' + e.stack);
    } finally {
        win.close();
    }

    console.log('');
    console.log('== ' + ok + ' ok, ' + falhas.length + ' falhas ==');
    if (falhas.length) {
        falhas.forEach((f) => console.log('   - ' + f));
        process.exit(1);
    }
    console.log('== E2E DO FRONT: TUDO VERDE ==');
    process.exit(0);
}());
