import assert from 'node:assert';
import { chatbotPublica, prepararChatbot } from './chatbot.js';

// Sem nada gravado: desligado, com o modelo e o nome padrão, sem chave
const vazio = chatbotPublica(null);
assert.strictEqual(vazio.ativo, false);
assert.strictEqual(vazio.modelo, 'gemini-3.8-flash');
assert.strictEqual(vazio.chave_definida, false);

// Ligar exige chave e texto-base
assert.throws(() => prepararChatbot({ ativo: true, texto_base: 'x' }, null), /chave do Gemini/);
assert.throws(() => prepararChatbot({ ativo: true, chave: 'abc' }, null), /texto-base/);

// A chave vai cifrada e nunca volta para a tela; em branco mantém a gravada
const gravada = prepararChatbot({ ativo: true, chave: 'minha-chave', texto_base: 'Vendemos sistemas.', vendedores: ['30', 'x', 31] }, null);
assert.ok(gravada.chave_cifrada && !gravada.chave_cifrada.includes('minha-chave'));
assert.deepStrictEqual(gravada.vendedores, [30, 31]);
assert.strictEqual('chave_cifrada' in chatbotPublica(gravada), false);
assert.strictEqual(chatbotPublica(gravada).chave_definida, true);
const regravada = prepararChatbot({ ...gravada, chave: '' }, gravada);
assert.strictEqual(regravada.chave_cifrada, gravada.chave_cifrada);

// O ponteiro do revezamento é do servidor: a tela não muda
assert.strictEqual(prepararChatbot({ ...gravada, chave: '', ultimo_vendedor_id: 99 }, { ...gravada, ultimo_vendedor_id: 30 }).ultimo_vendedor_id, 30);

// Só modelos da lista
assert.strictEqual(prepararChatbot({ ...gravada, chave: '', modelo: 'gemini-3.8-flash' }, gravada).modelo, 'gemini-3.8-flash');
assert.throws(() => prepararChatbot({ ...gravada, chave: '', modelo: 'gemini-inexistente' }, gravada), /não está na lista/);
assert.deepStrictEqual(chatbotPublica(null).modelos.map((m) => m.value), ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
// Modelo gravado que saiu da lista: a tela recebe o primeiro da lista
assert.strictEqual(chatbotPublica({ ...gravada, modelo: 'gemini-flash-latest' }).modelo, 'gemini-3.8-flash');

// Limite das horas para devolver ao bot
assert.throws(() => prepararChatbot({ ...gravada, chave: '', horas_devolver: 0 }, gravada), /1 a 720/);

console.log('chatbot: ok');
