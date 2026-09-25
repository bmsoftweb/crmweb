import assert from 'node:assert';
import { camposWebhook } from './d4sign';

// multipart/form-data, como a D4Sign envia
const f = 'X-abc';
const corpo = `--${f}\r\nContent-Disposition: form-data; name="uuid"\r\n\r\ndoc-123\r\n--${f}\r\nContent-Disposition: form-data; name="type_post"\r\n\r\n4\r\n--${f}\r\nContent-Disposition: form-data; name="message"\r\n\r\nlinha 1\r\nlinha 2\r\n--${f}--\r\n`;
assert.deepStrictEqual(camposWebhook(`multipart/form-data; boundary=${f}`, corpo), { uuid: 'doc-123', type_post: '4', message: 'linha 1\r\nlinha 2' });
assert.deepStrictEqual(camposWebhook('multipart/form-data; boundary="X-abc"', corpo).uuid, 'doc-123');
assert.deepStrictEqual(camposWebhook('application/x-www-form-urlencoded', 'uuid=doc-9&type_post=1&email=a%40b.c'), { uuid: 'doc-9', type_post: '1', email: 'a@b.c' });
assert.deepStrictEqual(camposWebhook('application/json', '{"uuid":"d","type_post":3}'), { uuid: 'd', type_post: '3' });
assert.deepStrictEqual(camposWebhook('application/json', 'lixo'), {});
console.log('d4sign: ok');
