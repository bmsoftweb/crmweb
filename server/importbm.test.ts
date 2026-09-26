import assert from 'node:assert';
import { converterProduto } from './importbm.js';

// PRODUTOSPRINCIPAL → produtos do CRM
const p = converterProduto({ id: 26070, descricao: ' ABAFADOR CONCHA ', texto: '[blob]', precovenda1: 16.299, unvenda: 'PC', ativo: 'S' });
assert.deepStrictEqual(p, { cod_integracao: 'BM-26070', codigo_sku: '26070', nome: 'ABAFADOR CONCHA', descricao: null, preco_tabela: 16.3, unidade_medida: 'PC', ativo: 1 });
// Sem preço, sem unidade, inativo
const q = converterProduto({ id: 1, descricao: 'ADUBO', precovenda1: null, unvenda: '', ativo: 'N' });
assert.strictEqual(q.preco_tabela, 0);
assert.strictEqual(q.unidade_medida, 'UN');
assert.strictEqual(q.ativo, 0);

console.log('importbm: ok');
process.exit(0);
