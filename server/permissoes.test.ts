import assert from 'node:assert';
import { OPCOES_MENU, lerPermissoes, podeAcessar, prepararPermissoes } from './permissoes.js';

// Opções do menu: telas fixas e cadastros; Usuários fica de fora (só administrador)
for (const id of ['dashboard', 'kanban', 'conversas', 'negocios', 'pessoas', 'departamentos']) assert.ok(OPCOES_MENU.includes(id), id);
assert.ok(!OPCOES_MENU.includes('usuarios'));
assert.ok(!OPCOES_MENU.includes('configuracoes'));

// Gravação: só ids conhecidos, sem repetir; null = acessa tudo
assert.deepStrictEqual(prepararPermissoes(['kanban', 'kanban', 'inexistente', 'pessoas']), ['kanban', 'pessoas']);
assert.strictEqual(prepararPermissoes(null), null);
assert.throws(() => prepararPermissoes('kanban'), /inválidas/);

// Leitura do banco (JSON em texto ou já convertido)
assert.deepStrictEqual(lerPermissoes('["kanban"]'), ['kanban']);
assert.deepStrictEqual(lerPermissoes(['pessoas']), ['pessoas']);
assert.strictEqual(lerPermissoes(null), null);
assert.strictEqual(lerPermissoes('lixo'), null);

// Acesso
const vendedor = { tipo: 'client', permissoes: ['kanban', 'pessoas'] };
assert.ok(podeAcessar(vendedor, 'kanban'));
assert.ok(!podeAcessar(vendedor, 'conversas'));
assert.ok(!podeAcessar(vendedor, 'usuarios'));
assert.ok(podeAcessar({ tipo: 'client', permissoes: null }, 'conversas'), 'sem permissões gravadas: acessa tudo');
assert.ok(podeAcessar({ tipo: 'client', permissoes: [] }, 'kanban') === false, 'lista vazia: não acessa nada');
assert.ok(podeAcessar({ tipo: 'admin', permissoes: [] }, 'conversas'), 'administrador acessa tudo');
assert.ok(podeAcessar({ tipo: 'admin' }, 'usuarios'));
// Configurações: só administrador, mesmo sem permissões gravadas
assert.ok(!podeAcessar({ tipo: 'client', permissoes: null }, 'configuracoes'));
assert.ok(podeAcessar({ tipo: 'admin', permissoes: [] }, 'configuracoes'));
assert.ok(!podeAcessar(null, 'kanban'));

console.log('permissoes: ok');
