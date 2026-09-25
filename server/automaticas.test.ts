import assert from 'node:assert';
import { PADRAO, automaticasPublica, prepararAutomaticas } from './automaticas.js';

// Sem nada gravado: tudo desligado, com os textos padrão e as variáveis de cada evento
const vazio = automaticasPublica(null);
assert.strictEqual(vazio.atividade.ativo, false);
assert.strictEqual(vazio.pedido.faturado, PADRAO.pedido.faturado);
assert.ok(vazio.variaveis.proposta.includes('validade'));

// Grava o padrão sem mexer
const base = prepararAutomaticas(PADRAO, null);
assert.strictEqual(base.pedido.ativado_em, null);

// Variável de outro evento é recusada, com a lista das válidas
assert.throws(
  () => prepararAutomaticas({ ...PADRAO, contrato: { ...PADRAO.contrato, texto: 'Vence {{validade}}' } }, null),
  /\{\{validade\}\} não existe.*\{\{fim\}\}/,
);
// O texto do vendedor tem as variáveis dele; o do cliente não tem o telefone do cliente
assert.strictEqual(prepararAutomaticas({ ...PADRAO, atividade: { ...PADRAO.atividade, texto_vendedor: 'Ligar para {{telefone_cliente}}' } }, null).atividade.texto_vendedor, 'Ligar para {{telefone_cliente}}');
assert.throws(() => prepararAutomaticas({ ...PADRAO, atividade: { ...PADRAO.atividade, texto: 'Fone {{telefone_cliente}}' } }, null), /\{\{telefone_cliente\}\} não existe/);
// Configuração gravada antes do texto do vendedor ganha o padrão
assert.strictEqual(automaticasPublica({ atividade: { ativo: true } }).atividade.texto_vendedor, PADRAO.atividade.texto_vendedor);
// Texto vazio só vale nos status do pedido (desliga aquele status)
assert.throws(() => prepararAutomaticas({ ...PADRAO, proposta: { ...PADRAO.proposta, texto: ' ' } }, null), /escreva o texto/);
assert.strictEqual(prepararAutomaticas({ ...PADRAO, pedido: { ...PADRAO.pedido, aprovado: '' } }, null).pedido.aprovado, '');
assert.throws(() => prepararAutomaticas({ ...PADRAO, pedido: { ativo: true, aprovado: '', faturado: '' } }, null), /pedido aprovado ou de pedido faturado/);
// Limites
assert.throws(() => prepararAutomaticas({ ...PADRAO, atividade: { ...PADRAO.atividade, horas: 0 } }, null), /de 1 a 72/);
assert.throws(() => prepararAutomaticas({ ...PADRAO, atividade: { ...PADRAO.atividade, ativo: true, tipos: ['xyz'] } }, null), /ao menos um tipo/);
// Tipo de atividade desconhecido é descartado
assert.deepStrictEqual(prepararAutomaticas({ ...PADRAO, atividade: { ...PADRAO.atividade, tipos: ['reuniao', 'xyz'] } }, null).atividade.tipos, ['reuniao']);

// Ligar o pedido marca quando (em Brasília); gravar de novo mantém a mesma marca; desligar apaga
const ligado = prepararAutomaticas({ ...PADRAO, pedido: { ...PADRAO.pedido, ativo: true } }, null);
assert.match(String(ligado.pedido.ativado_em), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
const deNovo = prepararAutomaticas({ ...ligado, pedido: { ...ligado.pedido, ativado_em: '2000-01-01 00:00:00' } }, { ...ligado, pedido: { ...ligado.pedido, ativado_em: '2026-01-01 10:00:00' } });
assert.strictEqual(deNovo.pedido.ativado_em, '2026-01-01 10:00:00'); // a tela não muda a marca
assert.strictEqual(prepararAutomaticas({ ...ligado, pedido: { ...ligado.pedido, ativo: false } }, ligado).pedido.ativado_em, null);

console.log('automaticas: ok');
