// Teste: npx tsx src/utils/importarArquivo.test.ts
import assert from 'node:assert';
import { acharCabecalhoPdf, agruparLinhas, lerData, lerNumero, valorEndereco, valorPersonalizado, detectarSeparador, lerCsv, sugerirDePara, tabelaDoPdf } from './importarArquivo';

assert.strictEqual(detectarSeparador('nome;email\nAna;a@x.com'), ';');
assert.strictEqual(detectarSeparador('nome,email\nAna,a@x.com'), ',');
assert.strictEqual(detectarSeparador('nome\temail\nAna\ta@x.com'), '\t');
assert.deepStrictEqual(lerCsv('﻿nome;obs\r\n"Silva; Ana";"diz ""oi""\nlinha 2"\r\n\r\nBia;\n', ';'), [
  ['nome', 'obs'],
  ['Silva; Ana', 'diz "oi"\nlinha 2'],
  ['Bia', ''],
]);
console.log('csv: ok');

// Relatório: cabeçalho, uma linha sem e-mail e o número da página
const linhas = agruparLinhas([
  { x: 10, y: 700, fim: 40, texto: 'Nome' }, { x: 200, y: 700, fim: 240, texto: 'E-mail' }, { x: 400, y: 700, fim: 440, texto: 'Fone' },
  { x: 10, y: 680, fim: 30, texto: 'Ana' }, { x: 32, y: 680.5, fim: 60, texto: 'Souza' }, { x: 200, y: 680, fim: 260, texto: 'ana@x.com' }, { x: 395, y: 680, fim: 450, texto: '(11) 9999' },
  { x: 10, y: 660, fim: 30, texto: 'Bia' }, { x: 420, y: 660, fim: 440, texto: '123' },
]);
assert.deepStrictEqual(tabelaDoPdf(linhas, 0, 6), [
  ['Nome', 'E-mail', 'Fone'],
  ['Ana Souza', 'ana@x.com', '(11) 9999'],
  ['Bia', '', '123'],
]);
console.log('pdf: ok');

assert.deepStrictEqual(sugerirDePara(['Código', 'Razão Social', 'E-mail', 'Celular', 'CPF/CNPJ', 'Limite de Crédito', 'Ramo de atividade'], ['cod_integracao', 'nome', 'email', 'telefone', 'cpf', 'obs', 'segmento', 'p:limite'].map((campo) => ({ campo, rotulo: campo === 'p:limite' ? 'Limite de crédito' : campo }))), {
  cod_integracao: 0, nome: 1, email: 2, telefone: 3, cpf: 4, obs: -1, segmento: 6, 'p:limite': 5,
});
console.log('de-para: ok');

const titulo = agruparLinhas([
  { x: 10, y: 800, fim: 200, texto: 'Relatório de clientes' },
  { x: 10, y: 700, fim: 40, texto: 'Nome' }, { x: 200, y: 700, fim: 240, texto: 'E-mail' },
  { x: 10, y: 680, fim: 40, texto: 'Ana' }, { x: 200, y: 680, fim: 240, texto: 'a@x' },
]);
assert.strictEqual(acharCabecalhoPdf(titulo, 6), 1);
console.log('cabeçalho pdf: ok');

assert.strictEqual(lerNumero('1.234,56'), '1234.56');
assert.strictEqual(lerNumero('1,234.56'), '1234.56');
assert.strictEqual(lerNumero('R$ 1.500'), '1500');
assert.strictEqual(lerNumero('12,5%'), '12.5');
assert.strictEqual(lerNumero('abc'), null);
assert.strictEqual(lerData('05/03/2026'), '2026-03-05');
assert.strictEqual(lerData('5/3/26'), '2026-03-05');
assert.strictEqual(lerData('2026-03-05 10:00'), '2026-03-05');
assert.strictEqual(lerData('31/02/2026'), null);
assert.strictEqual(valorPersonalizado('Não', 'boolean'), false);
assert.strictEqual(valorPersonalizado('X', 'boolean'), true);
assert.strictEqual(valorPersonalizado('ouro', 'lista', ['Bronze', 'Ouro']), 'Ouro');
assert.strictEqual(valorPersonalizado('Platina', 'lista', ['Ouro']), null);
assert.strictEqual(valorPersonalizado('2,5', 'numero'), null);
assert.strictEqual(valorPersonalizado('  ', 'texto'), undefined);
console.log('campos personalizados: ok');

assert.strictEqual(valorEndereco('end_cep', '01310100'), '01310-100');
assert.strictEqual(valorEndereco('end_cep', '123'), null);
assert.strictEqual(valorEndereco('end_uf', 'Paraná'), 'PR');
assert.strictEqual(valorEndereco('end_uf', 'sp'), 'SP');
assert.strictEqual(valorEndereco('end_uf', 'XX'), null);
assert.strictEqual(valorEndereco('end_uf', ' '), undefined);
console.log('endereço: ok');
