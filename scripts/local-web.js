/* ============================================================================
 *  local-web.js  -  substituto do nginx para rodar sem Docker.
 *
 *    node scripts/local-web.js [porta] [alvo-da-api]
 *    (padrao: 8081 e http://127.0.0.1:8080)
 *
 *  Faz o mesmo que o nginx.conf faz em producao: serve os estaticos de
 *  frontend/ e repassa /api/ para o WildFly. Nao substitui o nginx - existe
 *  so para desenvolver em maquina sem WSL/Hyper-V.
 * ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTA = Number(process.argv[2]) || 8081;
const ALVO = new URL(process.argv[3] || 'http://127.0.0.1:8080');
const RAIZ = path.join(__dirname, '..', 'frontend');

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

function repassar(req, res) {
    const opcoes = {
        hostname: ALVO.hostname,
        port: ALVO.port,
        path: req.url,
        method: req.method,
        headers: Object.assign({}, req.headers, { host: ALVO.host })
    };
    const upstream = http.request(opcoes, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
    });
    upstream.on('error', (e) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ c: 'UPSTREAM_FORA', e: 'API nao respondeu: ' + e.message }));
    });
    req.pipe(upstream);
}

function servir(req, res) {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') {
        rel = '/index.html';
    }

    // impede subir de diretorio (../../etc)
    const arquivo = path.normalize(path.join(RAIZ, rel));
    if (!arquivo.startsWith(RAIZ)) {
        res.writeHead(403).end('403');
        return;
    }

    fs.readFile(arquivo, (err, dados) => {
        if (err) {
            // fallback de SPA: rota desconhecida devolve o index
            fs.readFile(path.join(RAIZ, 'index.html'), (e2, html) => {
                if (e2) {
                    res.writeHead(404).end('404');
                    return;
                }
                res.writeHead(200, { 'Content-Type': TIPOS['.html'] });
                res.end(html);
            });
            return;
        }
        const ext = path.extname(arquivo).toLowerCase();
        res.writeHead(200, {
            'Content-Type': TIPOS[ext] || 'application/octet-stream',
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60'
        });
        res.end(dados);
    });
}

http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
        repassar(req, res);
    } else if (req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok\n');
    } else {
        servir(req, res);
    }
}).listen(PORTA, () => {
    console.log('front em  http://127.0.0.1:' + PORTA);
    console.log('api  via  ' + ALVO.origin + '/api');
});
