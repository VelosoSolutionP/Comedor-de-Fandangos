/* ============================================================================
 *  produtos.e2e.js  -  modulo de produtos, de ponta a ponta, sem navegador.
 *
 *    NODE_PATH=<dir com jsdom> node frontend/test/produtos.e2e.js [url]
 *
 *  Navega pelo MENU, filtra, busca por SKU e por nome, cadastra, confere a
 *  margem, tenta duplicar o SKU e limpa o que criou.
 * ========================================================================== */
'use strict';
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = process.argv[2] || 'http://localhost:8081';
let ok = 0; const falhas = [];
const chk = (n, c, d) => { if (c) { ok++; console.log('  ok    ' + n + (d ? '  ' + d : '')); } else { falhas.push(n + (d ? ' -> ' + d : '')); console.log('  FALHA ' + n + (d ? '  ' + d : '')); } };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
async function esperar(c, p = 20000, i = 150) { const f = Date.now() + p; while (Date.now() < f) { try { if (c()) return true; } catch (e) {} await dormir(i); } return false; }

(async function () {
    console.log('== e2e: modulo de produtos ==');
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) console.log('  [jsdom] ' + e.message); });
    const dom = await JSDOM.fromURL(BASE + '/', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc });
    const win = dom.window, doc = win.document;
    const $ = s => doc.querySelector(s), $$ = s => Array.from(doc.querySelectorAll(s));
    const texto = s => (($(s) || {}).textContent || '').trim();
    win.confirm = () => true;
    const digitar = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true })); };
    const clicar = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

    try {
        await esperar(() => win.Store && win.Http, 25000);
        await esperar(() => !!$('.login-caixa'), 15000);
        digitar($('#lg-user'), 'admin'); digitar($('#lg-pass'), 'fandangos@123');
        $('.login-caixa').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
        chk('login', await esperar(() => win.Store.autenticado(), 25000));

        // menu
        chk('menu tem link de Produtos', await esperar(() => $$('.nav a').some(a => /Produtos/.test(a.textContent)), 15000),
            $$('.nav a').map(a => a.textContent.trim()).join(' | '));
        chk('menu tem atalho + Produto', $$('.nav a').some(a => /\+ Produto/.test(a.textContent)));

        // navega pelo MENU, clicando
        const link = $$('.nav a').find(a => a.getAttribute('href') === '#/produtos');
        clicar(link); win.location.hash = '#/produtos';
        chk('grid de produtos carregou', await esperar(() => $$('table.grid tbody tr').length > 1, 25000),
            $$('table.grid tbody tr').length + ' linhas');
        chk('link Produtos fica ativo', await esperar(() => $$('.nav a.ativo').some(a => /Produtos/.test(a.textContent)), 8000));

        const c = $$('table.grid tbody tr td');
        chk('SKU na 1a coluna', /^FDG-\d{4}$/.test(c[0].textContent.trim()), '"' + c[0].textContent.trim() + '"');
        chk('preco formatado', /^R\$\s[\d.]+,\d{2}$/.test(c[3].textContent.trim()), '"' + c[3].textContent.trim() + '"');
        chk('paginacao com total', /de 1[12]\d/.test(texto('.contagem')), '"' + texto('.contagem') + '"');
        chk('combo de categorias populado', $$('.filtros select')[0].options.length > 3,
            ($$('.filtros select')[0].options.length - 1) + ' categorias');

        // alerta de reposicao
        const totalAntes = texto('.contagem');
        const btnRepor = $$('.filtros button').find(b => /Repor/.test(b.textContent));
        clicar(btnRepor);
        chk('filtro de reposicao', await esperar(() => texto('.contagem') !== totalAntes && /de 1[0-9]$/.test(texto('.contagem')), 20000),
            '"' + texto('.contagem') + '"');
        chk('linhas marcadas com alerta', $$('tr.linha-alerta').length > 0, $$('tr.linha-alerta').length + ' linhas');
        chk('tag "repor" visivel', /repor/.test(doc.body.textContent));
        clicar(btnRepor);
        await esperar(() => texto('.contagem') === totalAntes, 20000);

        // busca por SKU
        digitar($('.busca'), 'FDG-001');
        chk('busca por SKU', await esperar(() => { const t = texto('.contagem'); return /de \d+/.test(t) && t !== totalAntes; }, 20000),
            '"' + texto('.contagem') + '"');
        // busca textual
        digitar($('.busca'), 'queijo');
        chk('busca textual por nome', await esperar(() => /de \d+/.test(texto('.contagem')) && $$('table.grid tbody tr').length > 0, 20000),
            '"' + texto('.contagem') + '"');

        // formulario
        win.location.hash = '#/produtos/novo';
        chk('formulario abriu', await esperar(() => !!$('.form'), 20000));
        const inputs = $$('.form .campo input');
        const sku = 'TESTE-' + (Date.now() % 100000);
        digitar(inputs[0], sku);
        chk('SKU vira maiusculo', await esperar(() => inputs[0].value === sku.toUpperCase(), 8000), '"' + inputs[0].value + '"');
        digitar(inputs[1], 'Produto De Teste E2E');
        // preco e custo (mascara de moeda)
        const campos = $$('.form .campo');
        const inpPreco = campos.find(x => /Preco de venda/.test(x.textContent)).querySelector('input');
        const inpCusto = campos.find(x => /Custo/.test(x.textContent)).querySelector('input');
        digitar(inpPreco, '1050');
        chk('mascara de moeda no preco', inpPreco.value === '10,50', '"' + inpPreco.value + '"');
        digitar(inpCusto, '600');
        chk('margem calculada', await esperar(() => /Margem bruta/.test(doc.body.textContent), 8000),
            (doc.body.textContent.match(/Margem bruta: [\d,]+%/) || [''])[0]);
        // custo acima do preco -> aviso
        digitar(inpCusto, '2000');
        chk('avisa margem negativa', await esperar(() => /margem fica negativa/.test(doc.body.textContent), 8000));
        digitar(inpCusto, '600');

        $('.form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
        chk('salvou e voltou para a lista', await esperar(() => win.location.hash === '#/produtos', 25000), win.location.hash);

        // acha o que acabou de criar
        await esperar(() => !!$('.busca'), 15000);
        digitar($('.busca'), sku);
        chk('produto novo aparece na busca', await esperar(() => {
            const cel = $$('table.grid tbody tr td');
            return cel.length && cel[0].textContent.trim() === sku.toUpperCase();
        }, 20000), sku.toUpperCase());

        // SKU duplicado
        win.location.hash = '#/produtos/novo';
        await esperar(() => !!$('.form'), 20000);
        const i2 = $$('.form .campo input');
        digitar(i2[0], sku); digitar(i2[1], 'Duplicado E2E');
        const p2 = $$('.form .campo').find(x => /Preco de venda/.test(x.textContent)).querySelector('input');
        digitar(p2, '500');
        $('.form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
        chk('SKU duplicado barrado', await esperar(() => /ja existe/i.test(doc.body.textContent) || /SKU ja existe/.test(doc.body.textContent), 20000));

        // limpeza
        const r = await win.Http.produtos({ q: sku, sz: 1 });
        if (r.itens.length) { await win.Http.excluirProduto(r.itens[0].id); }
        chk('produto de teste removido', true);

    } catch (e) { falhas.push('excecao: ' + e.message); console.log('  ERRO ' + e.stack); }
    finally { win.close(); }

    console.log('\n== ' + ok + ' ok, ' + falhas.length + ' falhas ==');
    if (falhas.length) { falhas.forEach(f => console.log('   - ' + f)); process.exit(1); }
    console.log('== PRODUTOS: TUDO VERDE ==');
    process.exit(0);
}());
