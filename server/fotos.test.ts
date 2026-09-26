import assert from 'node:assert';
import { caminhoFoto, prepararFotos } from './fotos.js';

const blob = (n: number) => `https://abc123.public.blob.vercel-storage.com/produtos/1/${n}.jpg`;
// Até 4 endereços do Vercel Blob; lista vazia ou nada = sem fotos
assert.strictEqual(prepararFotos([blob(1), blob(2)], 'Fotos'), JSON.stringify([blob(1), blob(2)]));
assert.strictEqual(prepararFotos(JSON.stringify([blob(1)]), 'Fotos'), JSON.stringify([blob(1)]));
assert.strictEqual(prepararFotos([], 'Fotos'), null);
assert.strictEqual(prepararFotos(null, 'Fotos'), null);
assert.throws(() => prepararFotos([1, 2, 3, 4, 5].map(blob), 'Fotos'), /No máximo 4/);
// Endereço de fora do Blob não entra (a foto sempre passa pelo upload)
assert.throws(() => prepararFotos(['https://example.com/a.jpg'], 'Fotos'), /inválido/);
assert.throws(() => prepararFotos(['http://abc.public.blob.vercel-storage.com/a.jpg'], 'Fotos'), /inválido/);
assert.throws(() => prepararFotos({ a: 1 }, 'Fotos'), /formato inválido/);

// Nome do arquivo no padrão do b2b: produtos/<empresa>/<id com 9 dígitos>-<posição>.jpg
assert.strictEqual(caminhoFoto(1, 12345, 2), 'produtos/1/000012345-2.jpg');
assert.strictEqual(caminhoFoto('7', 1234567890, 4), 'produtos/7/1234567890-4.jpg');
// Endereço com ?v= (versão da foto) é aceito
assert.ok(prepararFotos([`${blob(1)}?v=ab12cd34`], 'Fotos'));

console.log('fotos: ok');
process.exit(0);
