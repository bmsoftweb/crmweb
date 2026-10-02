// Parcelas da condição de pagamento: npx tsx src/utils/parcelas.test.ts
import assert from 'node:assert';
import { dividirValor, gerarParcelas, prazosDe, redistribuir, somaParcelas, somarDias } from './parcelas';

assert.deepStrictEqual(prazosDe('0/30/60'), [0, 30, 60]);
assert.deepStrictEqual(prazosDe(' 30, 60 ; 90 '), [30, 60, 90]);
assert.deepStrictEqual(prazosDe(''), [0]);
// Virada de mês, de ano e fevereiro
assert.strictEqual(somarDias('2026-01-31', 30), '2026-03-02');
assert.strictEqual(somarDias('2026-12-15', 30), '2027-01-14');
// Arredondamento na última parcela
assert.deepStrictEqual(dividirValor(100, 3), [33.33, 33.33, 33.34]);
assert.strictEqual(somaParcelas(dividirValor(5496, 7)), 5496);
assert.deepStrictEqual(gerarParcelas('0/30', 1000, '2026-10-01', 'Boleto'), [
  { numero: 1, vencimento: '2026-10-01', forma_pagamento: 'Boleto', valor: 500 },
  { numero: 2, vencimento: '2026-10-31', forma_pagamento: 'Boleto', valor: 500 },
]);
// Recalcular: a ajustada à mão fica; as outras dividem o que falta
const ajustada = redistribuir(
  [
    { valor: 2000, ajustada: true },
    { valor: 1832, ajustada: false },
    { valor: 1832, ajustada: false },
  ],
  5496,
);
assert.deepStrictEqual(ajustada.map((p) => p.valor), [2000, 1748, 1748]);
// Ajustadas passando do total (ou todas ajustadas): não mexe
assert.deepStrictEqual(redistribuir([{ valor: 6000, ajustada: true }, { valor: 10, ajustada: false }], 5496).map((p) => p.valor), [6000, 10]);
console.log('ok');
