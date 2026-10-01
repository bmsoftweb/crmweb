// Impressão resumida: npx tsx src/utils/imprimirDocumento.test.ts
import assert from 'node:assert';
import { agruparItens } from './imprimirDocumento';

const LIC = { grupo_id: 1, grupo_nome: 'LICENÇA BMSOFT' };
const MENS = { grupo_id: 2, grupo_nome: 'MENSALIDADE BMSOFT' };
const linhas = agruparItens([
  { produto_nome: 'LICENÇA SERVIDOR', quantidade: 1, preco_unitario: 420, ...LIC },
  { produto_nome: 'LICENÇA TERMINAL', quantidade: 3, preco_unitario: 42, ...LIC },
  { produto_nome: 'HOMOLOGAÇÃO BOLETO', quantidade: 1, preco_unitario: 350 },
  { produto_nome: 'MENSALIDADE SERVIDOR', quantidade: 1, preco_unitario: 230, ...MENS },
  { produto_nome: 'LICENÇA CRM', quantidade: 1, preco_unitario: 1500, ...LIC },
  // com desconto no item: a linha leva o bruto (o desconto sai nos totais)
  { produto_nome: 'MENSALIDADE TERMINAL', quantidade: 3, preco_unitario: 40, desconto: 10, ...MENS },
]);
assert.deepStrictEqual(linhas, [
  { nome: 'LICENÇA BMSOFT', valor: 2046 },
  { nome: 'HOMOLOGAÇÃO BOLETO', valor: 350 },
  { nome: 'MENSALIDADE BMSOFT', valor: 350 },
]);
console.log('ok');
