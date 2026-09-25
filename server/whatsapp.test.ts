import assert from 'node:assert';
import { chaveTelefone, conteudoMensagem, telefoneWhatsApp } from './whatsapp.js';

assert.strictEqual(telefoneWhatsApp('(41) 99901-2223'), '5541999012223');
assert.strictEqual(telefoneWhatsApp('(41)35238200'), '554135238200');
assert.strictEqual(telefoneWhatsApp('041 99901-2223'), '5541999012223');
assert.strictEqual(telefoneWhatsApp('+55 41 99901-2223'), '5541999012223');
assert.throws(() => telefoneWhatsApp('99901-2223'), /inválido/);
assert.throws(() => telefoneWhatsApp(null), /inválido/);

// Mesma pessoa com e sem o 9, com e sem DDI, formatado ou não
const chave = chaveTelefone('554788489722', true);
assert.strictEqual(chave, '4788489722');
assert.strictEqual(chaveTelefone('(47) 98848-9722'), chave);
assert.strictEqual(chaveTelefone('+55 47 98848-9722'), chave);
assert.strictEqual(chaveTelefone('047 8848-9722'), chave);
assert.strictEqual(chaveTelefone('5547988489722', true), chave);
assert.notStrictEqual(chaveTelefone('(41) 98848-9722'), chave); // outro DDD
assert.strictEqual(chaveTelefone('14155550123', true), '+14155550123'); // fora do Brasil vale inteiro
assert.strictEqual(chaveTelefone('9722'), null);

// Conteúdo das mensagens da Evolution (Baileys)
assert.deepStrictEqual(conteudoMensagem({ conversation: 'Oi' }), { tipo: 'texto', texto: 'Oi', arquivo: null });
assert.deepStrictEqual(conteudoMensagem({ extendedTextMessage: { text: 'Link' }, messageContextInfo: {} }), { tipo: 'texto', texto: 'Link', arquivo: null });
assert.deepStrictEqual(conteudoMensagem({ imageMessage: { caption: 'Foto' } }), { tipo: 'imagem', texto: 'Foto', arquivo: null });
assert.deepStrictEqual(conteudoMensagem({ audioMessage: {} }), { tipo: 'audio', texto: null, arquivo: null });
assert.deepStrictEqual(
  conteudoMensagem({ documentWithCaptionMessage: { message: { documentMessage: { fileName: 'a.pdf', caption: 'Segue' } } } }),
  { tipo: 'documento', texto: 'Segue', arquivo: 'a.pdf' },
);
assert.deepStrictEqual(conteudoMensagem({ ephemeralMessage: { message: { conversation: 'Some' } } }), { tipo: 'texto', texto: 'Some', arquivo: null });
assert.strictEqual(conteudoMensagem({ reactionMessage: { text: '👍' } }), null);
assert.strictEqual(conteudoMensagem({ protocolMessage: {}, messageContextInfo: {} }), null);
assert.deepStrictEqual(conteudoMensagem({ pollCreationMessage: {} }), { tipo: 'outro', texto: null, arquivo: null });

console.log('whatsapp: ok');
