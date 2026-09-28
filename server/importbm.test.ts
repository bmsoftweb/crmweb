import assert from 'node:assert';
import { comRevenda, converterProduto, enderecoDoBm, enderecoIgual, valorRevenda } from './importbm.js';

// PRODUTOSPRINCIPAL → produtos do CRM
const p = converterProduto({ id: 26070, descricao: ' ABAFADOR CONCHA ', texto: '[blob]', precovenda1: 16.299, unvenda: 'PC', ativo: 'S' });
assert.deepStrictEqual(p, { cod_integracao: 'BM-26070', codigo_sku: '26070', nome: 'ABAFADOR CONCHA', descricao: null, preco_tabela: 16.3, unidade_medida: 'PC', ativo: 1 });
// Sem preço, sem unidade, inativo
const q = converterProduto({ id: 1, descricao: 'ADUBO', precovenda1: null, unvenda: '', ativo: 'N' });
assert.strictEqual(q.preco_tabela, 0);
assert.strictEqual(q.unidade_medida, 'UN');
assert.strictEqual(q.ativo, 0);

// Revenda: nome do vendedor do bmsoft → opção da lista com o mesmo nome (sem diferenciar maiúsculas); sem opção, o nome como veio
const opcoes = ['BMsoft', 'Dimapel', 'ACrescer', 'Company', 'Sysmov'];
assert.strictEqual(valorRevenda('DIMAPEL', opcoes), 'Dimapel');
assert.strictEqual(valorRevenda(' acrescer ', opcoes), 'ACrescer');
assert.strictEqual(valorRevenda('GLOBALTEK', opcoes), 'GLOBALTEK');
assert.strictEqual(valorRevenda('', opcoes), null);
assert.strictEqual(valorRevenda(null, opcoes), null);
// Personalizados: junta a revenda sem perder os outros campos; null quando não muda (ou sem revenda)
assert.strictEqual(comRevenda(null, 'Dimapel'), '{"revenda":"Dimapel"}');
assert.deepStrictEqual(JSON.parse(comRevenda('{"classificacao":"Ouro","revenda":"BMsoft"}', 'Dimapel')!), { classificacao: 'Ouro', revenda: 'Dimapel' });
assert.strictEqual(comRevenda('{"revenda":"Dimapel"}', 'Dimapel'), null);
assert.strictEqual(comRevenda('{"revenda":"Dimapel"}', null), null);
assert.strictEqual(comRevenda('ilegível', 'Company'), '{"revenda":"Company"}');

// Endereço do cadastro do bmsoft → endereço da pessoa (vazio = sem endereço)
const end = enderecoDoBm({ endereco: 'AV JOAO BERTOLI', numero: 819, complemento: null, bairro: 'CENTRO', cep: '89190-000', cidade: 'TAIO', uf: 'sc', cod_cidade: 4217808 });
assert.deepStrictEqual(end, { logradouro: 'AV JOAO BERTOLI', numero: '819', complemento: null, bairro: 'CENTRO', cep: '89190000', cidade: 'TAIO', uf: 'SC', codigo_ibge: '4217808' });
assert.strictEqual(enderecoDoBm({ endereco: '', cidade: null, cep: '' }), null);
assert.strictEqual(enderecoIgual({ ...end, id: 5, obs: 'x' }, end!), true);
assert.strictEqual(enderecoIgual({ ...end, numero: '820' }, end!), false);

console.log('importbm: ok');
process.exit(0);
