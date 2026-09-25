/** Valores por extenso em português (contratos): 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos" */

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 0 a 999 */
function ate999(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto < 20) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    partes.push(DEZENAS[Math.floor(resto / 10)] + (resto % 10 ? ` e ${UNIDADES[resto % 10]}` : ''));
  }
  return partes.join(' e ');
}

const ESCALAS: [string, string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
];

/** Inteiro por extenso (até 999 bilhões) */
export function numeroPorExtenso(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const grupos: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const [sing, plur] = ESCALAS[i];
    // "mil" e não "um mil"
    const numero = i === 1 && g === 1 ? '' : ate999(g);
    const escala = i === 0 ? '' : g === 1 ? sing : plur;
    partes.push({ texto: [numero, escala].filter(Boolean).join(' '), valor: g });
  }
  // O último grupo leva "e" quando é menor que 100 ou redondo em centenas (mil e cem; mil e vinte);
  // os demais só com espaço (mil duzentos e trinta)
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto;
      const ultimo = i === partes.length - 1;
      return (ultimo && (p.valor < 100 || p.valor % 100 === 0) ? ' e ' : ' ') + p.texto;
    })
    .join('');
}

/** Valor em reais por extenso */
export function reaisPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.abs(Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes: string[] = [];
  if (reais) {
    const texto = numeroPorExtenso(reais);
    // "um milhão de reais", "dois milhões de reais"
    const de = reais % 1_000_000 === 0 ? ' de' : '';
    partes.push(`${texto}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos) partes.push(`${numeroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero real';
}
