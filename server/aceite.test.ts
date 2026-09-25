import assert from 'node:assert';
import { documentoValido, hashConteudo, situacaoDoLink } from './aceite.js';

// Situação do link de aceite
const s = (status: string, versao = 1, ultima = 1, vencida = 0) => situacaoDoLink({ status, versao, ultima_versao: ultima, vencida });
assert.strictEqual(s('enviada'), 'aberta');
assert.strictEqual(s('rascunho'), 'aberta');
assert.strictEqual(s('aceita'), 'aceita');
assert.strictEqual(s('fechada'), 'fechada');
assert.strictEqual(s('recusada'), 'recusada');
// Nova versão gerada: a antiga (enviada ou recusada pela renegociação) fica substituída
assert.strictEqual(s('enviada', 1, 2), 'substituida');
assert.strictEqual(s('recusada', 1, 2), 'substituida');
assert.strictEqual(s('enviada', 1, 1, 1), 'vencida');
assert.strictEqual(s('expirada'), 'vencida');
// Aceita continua aceita mesmo vencida depois
assert.strictEqual(s('aceita', 1, 1, 1), 'aceita');

// CPF/CNPJ: só o tamanho (com ou sem máscara)
assert.ok(documentoValido('123.456.789-01'));
assert.ok(documentoValido('12345678000199'));
assert.ok(!documentoValido('1234'));

// Hash: igual para o mesmo conteúdo, muda se o valor muda
const p = { numero_proposta: 7, versao: 2, valor_subtotal: '100.00', valor_desconto: '0.00', valor_total: '100.00', data_validade: '2026-10-10', itens: [{ produto_id: 1, quantidade: '1', preco_unitario: '100', desconto: '0', subtotal: '100' }] };
assert.strictEqual(hashConteudo(p), hashConteudo({ ...p }));
assert.strictEqual(hashConteudo(p).length, 64);
assert.notStrictEqual(hashConteudo(p), hashConteudo({ ...p, valor_total: '99.00' }));

console.log('aceite: ok');
process.exit(0);
