import assert from 'node:assert';
import { lerNota, pesquisaPublica, prepararPesquisa } from './pesquisa.js';

// Nota pelo número ou pelas estrelas
assert.strictEqual(lerNota('4'), 4);
assert.strictEqual(lerNota(' 5 '), 5);
assert.strictEqual(lerNota('3 estrelas'), 3);
assert.strictEqual(lerNota('1.'), 1);
assert.strictEqual(lerNota('⭐⭐⭐⭐'), 4);
assert.strictEqual(lerNota('⭐️⭐️'), 2);
assert.strictEqual(lerNota('***'), 3);
// Não é nota: segue o atendimento normal
assert.strictEqual(lerNota('6'), null);
assert.strictEqual(lerNota('0'), null);
assert.strictEqual(lerNota('10'), null);
assert.strictEqual(lerNota('bom dia'), null);
assert.strictEqual(lerNota('4 horas atrasado'), null);
assert.strictEqual(lerNota('⭐⭐⭐⭐⭐⭐'), null);
assert.strictEqual(lerNota(''), null);

// Configuração: começa desligada, com textos padrão; validade de 1 a 43.200 minutos
assert.strictEqual(pesquisaPublica(null).ativo, false);
assert.ok(pesquisaPublica(null).opcoes.includes('5 ⭐⭐⭐⭐⭐'));
assert.strictEqual(prepararPesquisa({ ativo: true, pergunta: '' }).pergunta.includes('{{atendente}}'), true);
assert.throws(() => prepararPesquisa({ minutos: 0 }), /1 a 43.200/);
assert.strictEqual(prepararPesquisa({ ativo: true, minutos: 30 }).minutos, 30);
assert.strictEqual(pesquisaPublica(null).minutos, 1440);

console.log('pesquisa: ok');
