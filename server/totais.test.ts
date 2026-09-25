import assert from 'node:assert';
import { calcularTotais } from './totais';

// 2 × 10,00 − 1,50 = 18,50 ; 0,5 × 99,99 = 50,00 (arredondado) ; desconto adicional 3,00
const t = calcularTotais(
  [
    { produto_id: 'a', quantidade: '2', preco_unitario: '10', desconto: '1.5' },
    { produto_id: 'b', quantidade: 0.5, preco_unitario: 99.99, desconto: 0 },
  ],
  '3',
);
assert.deepStrictEqual([t.linhas[0].subtotal, t.linhas[1].subtotal], [18.5, 50]);
assert.strictEqual(t.subtotal, 70);
assert.strictEqual(t.desconto, 4.5);
assert.strictEqual(t.total, 65.5);
assert.throws(() => calcularTotais([{ produto_id: 'a', quantidade: 1, preco_unitario: 10, desconto: 11 }], 0), /desconto/);
assert.throws(() => calcularTotais([{ produto_id: 'a', quantidade: 0, preco_unitario: 10, desconto: 0 }], 0), /quantidade/);
assert.throws(() => calcularTotais([{ produto_id: 'a', quantidade: 1, preco_unitario: 10, desconto: 0 }], 11), /subtotal/);
console.log('totais: ok');
