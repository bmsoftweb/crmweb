import assert from 'node:assert';
import { ehCortesia, ehDespedida, lerNota, pesquisaPublica, prepararPesquisa } from './pesquisa.js';

// Nota pelo número ou pelas estrelas
assert.strictEqual(lerNota('4'), 4);
assert.strictEqual(lerNota(' 5 '), 5);
assert.strictEqual(lerNota('3 estrelas'), 3);
assert.strictEqual(lerNota('1.'), 1);
assert.strictEqual(lerNota('⭐⭐⭐⭐'), 4);
assert.strictEqual(lerNota('⭐️⭐️'), 2);
assert.strictEqual(lerNota('***'), 3);
// Não é nota: segue o atendimento normal
assert.strictEqual(lerNota('6'), null);
assert.strictEqual(lerNota('0'), null);
assert.strictEqual(lerNota('10'), null);
assert.strictEqual(lerNota('bom dia'), null);
assert.strictEqual(lerNota('4 horas atrasado'), null);
assert.strictEqual(lerNota('⭐⭐⭐⭐⭐⭐'), null);
assert.strictEqual(lerNota(''), null);

// Configuração: começa desligada, com textos padrão; validade de 1 a 43.200 minutos
assert.strictEqual(pesquisaPublica(null).ativo, false);
assert.ok(pesquisaPublica(null).opcoes.includes('5 ⭐⭐⭐⭐⭐'));
assert.strictEqual(prepararPesquisa({ ativo: true, pergunta: '' }).pergunta.includes('{{atendente}}'), true);
assert.throws(() => prepararPesquisa({ minutos: 0 }), /1 a 43.200/);
assert.strictEqual(prepararPesquisa({ ativo: true, minutos: 30 }).minutos, 30);
assert.strictEqual(pesquisaPublica(null).minutos, 1440);

// Cortesia depois do fim: ignorada. Qualquer outra coisa (ou saudação) segue como conversa
for (const t of ['de nada', 'De nada!', 'obrigado', 'Obrigadoo!!', 'valeu 👍', 'ok', '👍', '🙏🙏', 'muito obrigada pela atenção', 'eu que agradeço', 'tmj', 'abraço, tchau', 'igualmente 😊'])
  assert.strictEqual(ehCortesia(t), true, t);
for (const t of ['bom dia', 'obrigado, mas o sistema ainda trava', 'preciso de ajuda com a nota', 'oi', 'quero falar com o Rafael', '5', '', 'ok, e a nota fiscal?'])
  assert.strictEqual(ehCortesia(t), false, t);

// Mensagem da equipe que fecha a conversa (encerra sem aviso) × a que espera resposta (aviso de inatividade)
for (const t of ['Resolvido! Qualquer coisa estamos à disposição.', 'Obrigado pelo contato, tenha um ótimo dia!', 'Até mais!'])
  assert.strictEqual(ehDespedida(t), true, t);
for (const t of ['Conseguiu acessar?', 'Vou verificar e já te retorno, obrigado.', 'Me envia o print da tela', 'Obrigado! Posso ajudar em algo mais?'])
  assert.strictEqual(ehDespedida(t), false, t);

console.log('pesquisa: ok');
