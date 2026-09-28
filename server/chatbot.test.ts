import assert from 'node:assert';
import { chatbotPublica, escolhaDoTexto, explicarErro, temChave, listaMenu, minutosDevolver, prepararChatbot } from './chatbot.js';

// Sem nada gravado: modelo e nome padrão, sem chave
const vazio = chatbotPublica(null);
assert.strictEqual(vazio.modelo, 'gemini-3.8-flash');
assert.strictEqual(vazio.chave_definida, false);

// Ligar, texto-base e menu saíram do Chatbot (ficam na Automação): o que vier da versão antiga não volta à tela
const antiga = { ativo: true, modelo: 'gemini-3.8-flash', nome: 'Eloisa', minutos_devolver: 60, texto_base: 'Vendemos sistemas.', menu_texto: 'Escolha', menu: [{ departamento_id: 3, bot: true }] } as any;
for (const k of ['ativo', 'texto_base', 'menu', 'menu_texto']) assert.strictEqual(k in chatbotPublica(antiga), false, k);
// O texto-base antigo não é mais editado, mas continua gravado (nó IA sem texto-base próprio usa)
const regravadaAntiga = prepararChatbot({ modelo: 'gemini-3.8-flash', nome: 'Eloisa', minutos_devolver: 60, texto_base: 'outro', ativo: true, menu: [{ departamento_id: 1 }] }, antiga);
assert.strictEqual(regravadaAntiga.texto_base, 'Vendemos sistemas.');
for (const k of ['ativo', 'menu', 'menu_texto']) assert.strictEqual(k in regravadaAntiga, false, k);

// A chave vai cifrada e nunca volta para a tela; em branco mantém a gravada
const gravada = prepararChatbot({ chave: 'minha-chave', vendedores: [30, 31] }, null);
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
assert.deepStrictEqual(chatbotPublica(null).ias[0].modelos.map((m) => m.value), ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
// Configuração de antes da escolha da IA: Gemini
assert.strictEqual(chatbotPublica(gravada).ia, 'gemini');

// Claude: modelo da lista dele, chave própria; a chave do Gemini continua gravada
const claude = prepararChatbot({ ...gravada, ia: 'claude', modelo: 'claude-opus-5', chave: 'chave-claude' }, gravada);
assert.strictEqual(claude.ia, 'claude');
assert.ok(claude.chave_claude_cifrada && !claude.chave_claude_cifrada.includes('chave-claude'));
assert.strictEqual(claude.chave_cifrada, gravada.chave_cifrada);
assert.deepStrictEqual(chatbotPublica(claude).chaves, { gemini: true, claude: true, deepseek: false });

// DeepSeek: modelo deepseek-flash por padrão, chave própria; as outras continuam gravadas
const deepseek = prepararChatbot({ ia: 'deepseek', nome: 'Eloisa', minutos_devolver: 60, chave: 'sk-deepseek' }, claude);
assert.strictEqual(deepseek.modelo, 'deepseek-flash');
assert.ok(deepseek.chave_deepseek_cifrada && !deepseek.chave_deepseek_cifrada.includes('sk-deepseek'));
assert.strictEqual(deepseek.chave_claude_cifrada, claude.chave_claude_cifrada);
assert.deepStrictEqual(chatbotPublica(deepseek).chaves, { gemini: true, claude: true, deepseek: true });
assert.strictEqual('chave_deepseek_cifrada' in chatbotPublica(deepseek), false);
assert.strictEqual(temChave({ ...gravada, ia: 'deepseek' }), false);
assert.strictEqual('chave_claude_cifrada' in chatbotPublica(claude), false);
// Modelo do Gemini com o Claude escolhido não passa; IA fora da lista também não
assert.throws(() => prepararChatbot({ ...claude, chave: '', modelo: 'gemini-3.8-flash' }, claude), /lista do Claude/);
assert.throws(() => prepararChatbot({ ...claude, chave: '', ia: 'outra' }, claude), /não é uma das opções/);
// Sem modelo informado: o primeiro da IA escolhida
assert.strictEqual(prepararChatbot({ ia: 'claude', chave: '' }, claude).modelo, 'claude-opus-5');
// Chave do Claude digitada com o Gemini escolhido fica no Gemini: só a da IA escolhida muda
assert.strictEqual(prepararChatbot({ ...claude, ia: 'gemini', modelo: 'gemini-3.8-flash', chave: '' }, claude).chave_claude_cifrada, claude.chave_claude_cifrada);
// Só a chave do Gemini gravada e o Claude escolhido: sem chave
assert.strictEqual(temChave({ ...gravada, ia: 'claude' }), false);
assert.strictEqual(temChave(claude), true);
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

// Erro do Gemini traduzido na linha de falha da automação
assert.match(explicarErro('{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}'), /sobrecarregada/);
// Erro do Claude: o código vem no começo da mensagem (às vezes depois de "nó X: ")
assert.match(explicarErro('nó IA: 529 {"type":"error","error":{"type":"overloaded_error"}}'), /sobrecarregada agora \(529\)/);
assert.match(explicarErro('401 {"type":"error","error":{"type":"authentication_error"}}'), /chave da IA inválida/);
assert.match(explicarErro('400 {"type":"error","error":{"message":"Your credit balance is too low"}}'), /créditos da conta Anthropic/);
// DeepSeek: "code" é texto (não confunde com o código HTTP); 402 = saldo acabou
assert.match(explicarErro('401 {"error":{"message":"Authentication Fails","code":"invalid_request_error"}}'), /chave da IA inválida/);
assert.match(explicarErro('402 {"error":{"message":"Insufficient Balance"}}'), /saldo da conta da IA acabou/);
assert.match(explicarErro('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'), /limite de uso/);
assert.strictEqual(explicarErro('timeout'), 'timeout');
