import assert from 'node:assert';
import { telefoneWhatsApp } from './whatsapp';

assert.strictEqual(telefoneWhatsApp('(41) 99901-2223'), '5541999012223');
assert.strictEqual(telefoneWhatsApp('(41)35238200'), '554135238200');
assert.strictEqual(telefoneWhatsApp('041 99901-2223'), '5541999012223');
assert.strictEqual(telefoneWhatsApp('+55 41 99901-2223'), '5541999012223');
assert.throws(() => telefoneWhatsApp('99901-2223'), /inválido/);
assert.throws(() => telefoneWhatsApp(null), /inválido/);

console.log('whatsapp: ok');
