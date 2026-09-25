// Teste: npx tsx src/utils/crm.test.ts
import assert from 'node:assert';
import { semaforoFollowup } from './crm';
import { hojeIso } from './formatters';

const hoje = hojeIso();
const agora = new Date();
agora.setHours(12, 0, 0, 0);
assert.strictEqual(semaforoFollowup(null, null, agora), 'amarelo');
assert.strictEqual(semaforoFollowup('2000-01-01', null, agora), 'vermelho');
assert.strictEqual(semaforoFollowup('2999-01-01', '08:00:00', agora), 'verde');
assert.strictEqual(semaforoFollowup(hoje, null, agora), 'verde'); // sem hora: vale o dia todo
assert.strictEqual(semaforoFollowup(hoje, '11:59:00', agora), 'vermelho');
assert.strictEqual(semaforoFollowup(hoje, '12:30:00', agora), 'verde');
console.log('semáforo: ok');
