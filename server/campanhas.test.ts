import assert from 'node:assert';
import { normalizarCriterios, sqlCriterios, variaveisDoTexto, personalizar } from './campanhas';

// Objeto único (formato do exemplo do migration) vira lista; número e sim/não são convertidos
const c = normalizarCriterios('{"regra":"ultima_compra","operador":">","valor":"60"}');
assert.deepStrictEqual(c, [{ regra: 'ultima_compra', operador: '>', valor: 60 }]);
assert.deepStrictEqual(normalizarCriterios([{ regra: 'tem_email', operador: '=', valor: true }])[0].valor, 1);

// Regra e operador passam por whitelist; o valor vai só como parâmetro
assert.throws(() => normalizarCriterios([{ regra: 'p.id; DROP TABLE x', operador: '=', valor: 1 }]), /não existe/);
assert.throws(() => normalizarCriterios([{ regra: 'tipo', operador: 'OR 1=1 --', valor: 'lead' }]), /operador/);
assert.throws(() => normalizarCriterios([{ regra: 'tem_email', operador: '>', valor: 1 }]), /use "="/);
assert.throws(() => normalizarCriterios([{ regra: 'qtd_pedidos', operador: '=', valor: 'abc' }]), /número/);
assert.throws(() => normalizarCriterios([]), /ao menos um/);

const { where, params } = sqlCriterios(normalizarCriterios([{ regra: 'tipo', operador: '=', valor: "x' OR '1'='1" }]), 7);
assert.strictEqual(where, 'p.empresa_id = ? AND p.tipo = ?');
assert.deepStrictEqual(params, [7, "x' OR '1'='1"]);

// Variáveis
assert.deepStrictEqual(variaveisDoTexto('Olá {{nome}}', 'desde {{ ultima_compra }} {{nome}}'), ['nome', 'ultima_compra']);
assert.throws(() => variaveisDoTexto('{{senha}}'), /inexistente: \{\{senha\}\}/);
assert.strictEqual(personalizar('Olá {{Primeiro_Nome}}, {{cidade}}!', { primeiro_nome: 'Ana', cidade: null }), 'Olá Ana, !');

console.log('campanhas: ok');
