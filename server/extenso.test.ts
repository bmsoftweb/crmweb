import assert from 'node:assert';
import { reaisPorExtenso } from './extenso.js';

const casos: [number, string][] = [
  [0, 'zero real'],
  [0.01, 'um centavo'],
  [1, 'um real'],
  [2.5, 'dois reais e cinquenta centavos'],
  [100, 'cem reais'],
  [101, 'cento e um reais'],
  [1000, 'mil reais'],
  [1001, 'mil e um reais'],
  [1100, 'mil e cem reais'],
  [1234.5, 'mil duzentos e trinta e quatro reais e cinquenta centavos'],
  [2700, 'dois mil e setecentos reais'],
  [32400, 'trinta e dois mil e quatrocentos reais'],
  [73080, 'setenta e três mil e oitenta reais'],
  [1000000, 'um milhão de reais'],
  [2500000, 'dois milhões e quinhentos mil reais'],
  [2530000, 'dois milhões quinhentos e trinta mil reais'],
  [1000001.99, 'um milhão e um reais e noventa e nove centavos'],
];
for (const [v, esperado] of casos) assert.strictEqual(reaisPorExtenso(v), esperado, `${v}`);
console.log('extenso: ok');
