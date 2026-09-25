import assert from 'node:assert';
import { agoraBrasilia, comparar, dentroDoHorario, ipInterno, jornadaPublica, pegar, preencher, prepararJornada, saidasDoNo } from './jornada.js';

const inicio = { id: 'inicio', tipo: 'inicio', x: 0, y: 0, dados: {} };
const menu = { id: 'm1', tipo: 'menu', x: 0, y: 100, dados: { texto: 'Escolha:', opcoes: [{ id: 'o1', rotulo: 'Vendas' }, { id: 'o2', rotulo: 'Suporte' }] } };
const fim = { id: 'f', tipo: 'fim', x: 0, y: 200, dados: {} };
const base = { ativo: false, modo: 'teste', numeros_teste: [], nos: [inicio, menu, fim], ligacoes: [{ de: 'inicio', saida: 'proximo', para: 'm1' }, { de: 'm1', saida: 'o1', para: 'f' }] };

// Estrutura válida passa; saídas de cada tipo
const ok = prepararJornada(base, null);
assert.strictEqual(ok.nos.length, 3);
assert.deepStrictEqual(saidasDoNo(ok.nos[1]), ['o1', 'o2', 'invalida']);
assert.deepStrictEqual(saidasDoNo({ tipo: 'api', dados: {} }), ['sucesso', 'erro']);
assert.deepStrictEqual(saidasDoNo({ tipo: 'fim', dados: {} }), []);

// Erros de estrutura
assert.throws(() => prepararJornada({ ...base, nos: [menu, fim] }, null), /exatamente um nó Início/);
assert.throws(() => prepararJornada({ ...base, nos: [inicio, inicio, fim] }, null), /repetido/);
assert.throws(() => prepararJornada({ ...base, ligacoes: [{ de: 'm1', saida: 'o9', para: 'f' }] }, null), /saída "o9" não existe/);
assert.throws(() => prepararJornada({ ...base, ligacoes: [{ de: 'm1', saida: 'o1', para: 'f' }, { de: 'm1', saida: 'o1', para: 'inicio' }] }, null), /Início|mais de uma/);
assert.throws(() => prepararJornada({ ...base, ligacoes: [{ de: 'm1', saida: 'o1', para: 'f' }, { de: 'm1', saida: 'o1', para: 'm1' }] }, null), /mais de uma ligação/);
assert.throws(() => prepararJornada({ ...base, nos: [inicio, { ...menu, dados: { opcoes: [] } }, fim], ligacoes: [] }, null), /1 a 9 opções/);
assert.throws(() => prepararJornada({ ...base, nos: [inicio, { id: 'p', tipo: 'pergunta', dados: { texto: 'Nome?', variavel: '1x' } }], ligacoes: [] }, null), /variável/);
assert.throws(() => prepararJornada({ ...base, nos: [inicio, { id: 'e', tipo: 'esperar', dados: { minutos: 0 } }], ligacoes: [] }, null), /1 a 43.200/);
assert.throws(() => prepararJornada({ ...base, nos: [inicio, { id: 'a', tipo: 'api', dados: { url: 'http://x.com' } }], ligacoes: [] }, null), /https/);
assert.throws(() => prepararJornada({ ...base, ativo: true }, null), /número de teste/);
assert.throws(() => prepararJornada({ ...base, numeros_teste: ['123'] }, null), /número de teste inválido/);
assert.deepStrictEqual(prepararJornada({ ...base, numeros_teste: ['(47) 99116-6107', '47991166107'] }, null).numeros_teste, ['47991166107']);

// Cabeçalho secreto: cifrado, nunca volta para a tela; em branco mantém o gravado
const api = (valor: string) => ({
  ...base,
  nos: [inicio, { id: 'a', tipo: 'api', dados: { url: 'https://api.exemplo.com/{{numero}}', metodo: 'POST', cabecalhos: [{ nome: 'Authorization', valor, secreto: true }], extrair: [{ caminho: 'dados.status', variavel: 'status' }] } }],
  ligacoes: [],
});
const comSegredo = prepararJornada(api('Bearer xyz'), null);
const cab = comSegredo.nos[1].dados.cabecalhos[0];
assert.ok(cab.valor_cifrado && !cab.valor_cifrado.includes('xyz') && cab.valor === '');
const publica = jornadaPublica(comSegredo).nos[1].dados.cabecalhos[0];
assert.strictEqual('valor_cifrado' in publica, false);
assert.strictEqual(publica.definido, true);
assert.strictEqual(prepararJornada(api(''), comSegredo).nos[1].dados.cabecalhos[0].valor_cifrado, cab.valor_cifrado);
assert.throws(() => prepararJornada(api(''), null), /cabeçalho secreto/);

// Variáveis
const vars = { nome: 'Ana "Maria"', empresa: 'Loja & Cia' };
assert.strictEqual(preencher('Olá {{nome}} da {{ empresa }}! {{nada}}', vars), 'Olá Ana "Maria" da Loja & Cia! ');
assert.strictEqual(preencher('{"n":"{{nome}}"}', vars, (v) => JSON.stringify(v).slice(1, -1)), '{"n":"Ana \\"Maria\\""}');
assert.strictEqual(preencher('https://x.com/?e={{empresa}}', vars, encodeURIComponent), 'https://x.com/?e=Loja%20%26%20Cia');

// Comparações (sem acento, sem maiúsculas; números com vírgula)
assert.ok(comparar('igual', 'São Paulo', 'sao paulo'));
assert.ok(comparar('contem', 'Quero o FINANCEIRO', 'financeiro'));
assert.ok(comparar('comeca', 'Boleto atrasado', 'bol'));
assert.ok(comparar('maior', '1.500,50', '1000'));
assert.ok(comparar('menor', '10', '9,5') === false);
assert.ok(comparar('vazio', '  ', ''));
assert.ok(comparar('preenchido', 'x', ''));
assert.ok(comparar('regex', 'CPF 123.456.789-00', '\\d{3}\\.\\d{3}'));
assert.ok(comparar('regex', 'x', '(') === false);

// Horário comercial (seg a sex, 8h às 18h)
const util = { dias: [1, 2, 3, 4, 5], das: '08:00', ate: '18:00' };
assert.ok(dentroDoHorario(util, { dia: 1, hora: '08:00' }));
assert.ok(!dentroDoHorario(util, { dia: 1, hora: '18:00' }));
assert.ok(!dentroDoHorario(util, { dia: 0, hora: '10:00' }));
// 25/09/2026 12:00 UTC = sexta, 09:00 em Brasília
assert.deepStrictEqual(agoraBrasilia(new Date('2026-09-25T12:00:00Z')), { dia: 5, hora: '09:00' });

// Caminho na resposta da API
assert.strictEqual(pegar({ a: { b: [{ c: 7 }] } }, 'a.b.0.c'), 7);
assert.strictEqual(pegar(null, 'a.b'), undefined);

// Rede interna bloqueada
for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0']) assert.ok(ipInterno(ip), ip);
for (const ip of ['8.8.8.8', '172.32.0.1', '2804:14c::1']) assert.ok(!ipInterno(ip), ip);

console.log('jornada: ok');
