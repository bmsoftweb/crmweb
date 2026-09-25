/**
 * Cálculo dos documentos com itens (proposta e pedido), feito sempre no servidor:
 * o navegador só mostra a prévia. Teste: npx tsx server/totais.test.ts
 */

export const num = (v: any) => {
  const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
  return Number.isFinite(n) ? n : 0;
};
const centavos = (v: number) => Math.round(v * 100) / 100;

export interface ItemEntrada {
  produto_id: string;
  quantidade: any;
  preco_unitario: any;
  desconto: any;
}

/**
 * subtotal do item = quantidade × preço unitário − desconto do item.
 * O desconto do documento soma os descontos dos itens e o desconto adicional.
 */
export function calcularTotais(itens: ItemEntrada[], descontoAdicional: any) {
  const linhas = itens.map((it, i) => {
    const quantidade = Math.round(num(it.quantidade) * 1000) / 1000;
    const preco = centavos(num(it.preco_unitario));
    const desconto = centavos(num(it.desconto));
    const bruto = centavos(quantidade * preco);
    if (!it.produto_id) throw new Error(`Item ${i + 1}: escolha o produto.`);
    if (quantidade <= 0) throw new Error(`Item ${i + 1}: a quantidade deve ser maior que zero.`);
    if (preco < 0 || desconto < 0) throw new Error(`Item ${i + 1}: preço e desconto não podem ser negativos.`);
    if (desconto > bruto) throw new Error(`Item ${i + 1}: o desconto é maior que o valor do item.`);
    return { produto_id: String(it.produto_id), quantidade, preco_unitario: preco, desconto, subtotal: centavos(bruto - desconto), bruto };
  });
  const subtotal = centavos(linhas.reduce((s, l) => s + l.bruto, 0));
  const descontoItens = centavos(linhas.reduce((s, l) => s + l.desconto, 0));
  const adicional = centavos(num(descontoAdicional));
  if (adicional < 0) throw new Error('O desconto adicional não pode ser negativo.');
  const desconto = centavos(descontoItens + adicional);
  if (desconto > subtotal) throw new Error('O desconto total é maior que o subtotal.');
  return { linhas, subtotal, desconto, total: centavos(subtotal - desconto) };
}

