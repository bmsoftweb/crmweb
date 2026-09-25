import assert from 'node:assert';
import { chatbotPublica, escolhaDoTexto, listaMenu, minutosDevolver, prepararChatbot } from './chatbot.js';

// Sem nada gravado: desligado, com o modelo e o nome padrão, sem chave
const vazio = chatbotPublica(null);
assert.strictEqual(vazio.ativo, false);
assert.strictEqual(vazio.modelo, 'gemini-3.8-flash');
assert.strictEqual(vazio.chave_definida, false);

// Ligar exige chave e texto-base
assert.throws(() => prepararChatbot({ ativo: true, texto_base: 'x' }, null), /chave do Gemini/);
assert.throws(() => prepararChatbot({ ativo: true, chave: 'abc' }, null), /texto-base/);

// A chave vai cifrada e nunca volta para a tela; em branco mantém a gravada
const gravada = prepararChatbot({ ativo: true, chave: 'minha-chave', texto_base: 'Vendemos sistemas.', vendedores: [30, 31] }, null);
assert.ok(gravada.chave_cifrada && !gravada.chave_cifrada.includes('minha-chave'));
// O revezamento é do cadastro de usuários: a lista antiga não é mais gravada nem devolvida
assert.strictEqual('vendedores' in gravada, false);
assert.strictEqual('vendedores' in chatbotPublica({ ...gravada, vendedores: [1] } as any), false);
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

// Minutos para devolver ao bot: limite, e a configuração antiga (horas) convertida
assert.throws(() => prepararChatbot({ ...gravada, chave: '', minutos_devolver: 0 }, gravada), /1 a 43.200/);
assert.strictEqual(prepararChatbot({ ...gravada, chave: '', minutos_devolver: 30 }, gravada).minutos_devolver, 30);
assert.strictEqual(minutosDevolver({ horas_devolver: 4 } as any), 240);
assert.strictEqual(minutosDevolver({ minutos_devolver: 15, horas_devolver: 4 } as any), 15);
assert.strictEqual(minutosDevolver(null), 240);
assert.strictEqual(chatbotPublica({ ...gravada, minutos_devolver: undefined, horas_devolver: 2 } as any).minutos_devolver, 120);
assert.strictEqual('horas_devolver' in chatbotPublica({ ...gravada, horas_devolver: 2 } as any), false);

// Menu de departamentos: sem repetidos, id inválido fora, no máximo 9
const comMenu = prepararChatbot({ ...gravada, chave: '', menu: [{ departamento_id: 3, bot: true }, { departamento_id: '3' }, { departamento_id: 'x' }, { departamento_id: 5 }] }, gravada);
assert.deepStrictEqual(comMenu.menu, [{ departamento_id: 3, bot: true }, { departamento_id: 5, bot: false }]);
assert.ok(comMenu.menu_texto);
assert.throws(() => prepararChatbot({ ...gravada, chave: '', menu: Array.from({ length: 10 }, (_, i) => ({ departamento_id: i + 1 })) }, gravada), /no máximo 9/);

const opcoes = [
  { numero: 1, departamento_id: 3, nome: 'Vendas', bot: true },
  { numero: 2, departamento_id: 5, nome: 'Suporte Técnico', bot: false },
  { numero: 3, departamento_id: 7, nome: 'Financeiro', bot: false },
];
assert.strictEqual(listaMenu(opcoes), '1 - Vendas\n2 - Suporte Técnico\n3 - Financeiro');
assert.strictEqual(escolhaDoTexto('2', opcoes)?.departamento_id, 5);
assert.strictEqual(escolhaDoTexto(' 3. ', opcoes)?.departamento_id, 7);
assert.strictEqual(escolhaDoTexto('Opção 1', opcoes)?.departamento_id, 3);
assert.strictEqual(escolhaDoTexto('4', opcoes), null);
assert.strictEqual(escolhaDoTexto('quero o financeiro', opcoes)?.departamento_id, 7);
assert.strictEqual(escolhaDoTexto('suporte tecnico por favor', opcoes)?.departamento_id, 5);
// Dois departamentos citados, ou nenhum: quem decide é a IA
assert.strictEqual(escolhaDoTexto('vendas ou financeiro?', opcoes), null);
assert.strictEqual(escolhaDoTexto('bom dia', opcoes), null);

console.log('chatbot: ok');
