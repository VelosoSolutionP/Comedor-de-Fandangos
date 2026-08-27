/* Roda os MESMOS casos do DocumentosTest.java contra o validators.js.
   Os dois lados implementam o algoritmo identico, entao isto valida os
   dados de teste e a logica de DV. Nao substitui o JUnit. */
const fs = require('fs');
const vm = require('vm');

const path = require('path');
const base = path.join(__dirname, '..', 'app', 'core') + path.sep;
const sandbox = { window: {}, console, document: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

// mask.js precisa de angular.module(...).directive/filter -> stub encadeavel
const stubMod = { directive: () => stubMod, filter: () => stubMod, config: () => stubMod };
sandbox.window.angular = { module: () => stubMod };

for (const f of ['mask.js', 'validators.js']) {
    vm.runInContext(fs.readFileSync(base + f, 'utf8'), sandbox, { filename: f });
}

const V = sandbox.window.Validar;
const M = sandbox.window.Mask;

let ok = 0, falhas = [];
function t(nome, real, esperado) {
    if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; }
    else { falhas.push(`${nome}: esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(real)}`); }
}

// ---- CPF valido
['529.982.247-25', '52998224725', '111.444.777-35', '390.533.447-05']
    .forEach(d => t('cpf valido ' + d, V.documento(d), true));
// ---- CPF invalido
['529.982.247-26', '52998224724', '111.444.777-30']
    .forEach(d => t('cpf invalido ' + d, V.documento(d), false));
// ---- repetidos
['00000000000', '11111111111', '99999999999', '00000000000000', '11111111111111']
    .forEach(d => t('repetido ' + d, V.documento(d), false));
// ---- CNPJ valido
['11.222.333/0001-81', '11222333000181', '34.028.316/0001-03', '00.000.000/0001-91']
    .forEach(d => t('cnpj valido ' + d, V.documento(d), true));
// ---- CNPJ invalido
['11.222.333/0001-82', '11222333000180', '34028316000104']
    .forEach(d => t('cnpj invalido ' + d, V.documento(d), false));
// ---- bordas
[null, '', '123', '5299822472', '529982247251', 'abcdefghijk']
    .forEach(d => t('borda ' + d, V.documento(d), false));
// ---- tipo derivado
t('tipo cpf', V.tipoDocumento('529.982.247-25'), 'F');
t('tipo cnpj', V.tipoDocumento('11.222.333/0001-81'), 'J');
t('tipo invalido', V.tipoDocumento('529.982.247-26'), null);

// ---- mascaras
t('mask cpf', M.cpf('52998224725'), '529.982.247-25');
t('mask cnpj', M.cnpj('11222333000181'), '11.222.333/0001-81');
t('mask cpfCnpj curto', M.cpfCnpj('529982247'), '529.982.247');
t('mask telefone 11', M.telefone('11987654321'), '(11) 98765-4321');
t('mask telefone 10', M.telefone('1133334444'), '(11) 3333-4444');
t('mask cep', M.cep('01310100'), '01310-100');
t('mask data', M.data('27081990'), '27/08/1990');
t('mask moeda', M.moeda('1234567'), '12.345,67');
t('moeda->numero', M.moedaParaNumero('12.345,67'), 12345.67);
t('numero->moeda', M.numeroParaMoeda(12345.67), '12.345,67');
t('data->iso', M.dataParaIso('27/08/1990'), '1990-08-27');
t('data invalida 31/02', M.dataParaIso('31/02/1990'), null);
t('iso->data', M.isoParaData('1990-08-27'), '27/08/1990');

// ---- validacoes de formulario
t('email ok', V.email('a@b.com'), true);
t('email ruim', V.email('a@b'), false);
t('email vazio e opcional', V.email(''), true);
t('telefone 9 digitos', V.telefone('11987654321'), true);
t('telefone curto', V.telefone('1198765'), false);
t('cep ok', V.cep('01310100'), true);
t('cep curto', V.cep('0131010'), false);
t('uf ok', V.uf('sp'), true);
t('uf ruim', V.uf('XX'), false);
t('nascimento futuro', V.dataNascimento('01/01/2999'), false);
t('nascimento ok', V.dataNascimento('27/08/1990'), true);

const form = V.formularioCliente({
    doc: '529.982.247-25', nm: 'Ana Silva', em: 'ana@fandangos.dev',
    tel: '11987654321', cep: '01310100', uf: 'SP', nascBr: '27/08/1990', limNum: 500
});
t('formulario valido', form.ok, true);

const ruim = V.formularioCliente({
    doc: '111', nm: 'A', em: 'x@', tel: '1', cep: '2', uf: 'ZZ', nascBr: '31/02/1990', limNum: -1
});
t('formulario invalido', ruim.ok, false);
t('formulario aponta 8 erros', Object.keys(ruim.erros).length, 8);

console.log(`\n  ${ok} asserts passaram`);
if (falhas.length) {
    console.log(`  ${falhas.length} FALHARAM:`);
    falhas.forEach(f => console.log('   - ' + f));
    process.exit(1);
}
console.log('  TODOS OS TESTES PASSARAM\n');
