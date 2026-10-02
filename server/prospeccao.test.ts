import assert from 'node:assert';
import { celularBR, enderecoDoGoogle, extrairContatos, formatarTelefone, ipInterno, pontuar, prepararConfigProspeccao } from './prospeccao.js';

// Celular brasileiro: com ou sem DDI e máscara; fixo e estrangeiro ficam de fora
assert.strictEqual(celularBR('+55 47 98848-9722'), '5547988489722');
assert.strictEqual(celularBR('(47) 98848-9722'), '5547988489722');
assert.strictEqual(celularBR('(47) 3521-0000'), null);
assert.strictEqual(celularBR('+1 415 555 0100'), null);
assert.strictEqual(celularBR(null), null);

assert.strictEqual(formatarTelefone('+55 47 98848-9722'), '(47) 98848-9722');
assert.strictEqual(formatarTelefone('4735210000'), '(47) 3521-0000');
assert.strictEqual(formatarTelefone(null), null);

// Site: WhatsApp (wa.me e api.whatsapp.com), e-mail e Instagram; imagens e perfis genéricos não contam
const html = `
  <a href="https://wa.me/554735210000">fixo</a>
  <a href="https://api.whatsapp.com/send?text=oi&amp;phone=5547988489722">Fale conosco</a>
  <img src="logo@2x.png"> <a href="mailto:Contato@Clinica.com.br">e-mail</a>
  <a href="https://instagram.com/p/abc">post</a> <a href="https://www.instagram.com/clinica.sorriso/">insta</a>`;
assert.deepStrictEqual(extrairContatos(html), { whatsapp: '5547988489722', email: 'contato@clinica.com.br', instagram: 'https://instagram.com/clinica.sorriso' });
assert.deepStrictEqual(extrairContatos(''), { whatsapp: null, email: null, instagram: null });
assert.strictEqual(extrairContatos('<a href="https://wa.me/5547988489722?text=Ol%C3%A1">').whatsapp, '5547988489722');

// Nota de qualificação
const completo = pontuar({ celular: '5547988489722', whatsapp_site: '5547988489722', nota: 4.8, avaliacoes: 250, site: 'https://x.com.br', email: 'a@x.com.br' });
assert.strictEqual(completo.pontos, 100);
assert.deepStrictEqual(completo.motivos, ['WhatsApp no site', 'Nota 4.8', '250 avaliações', 'Site', 'E-mail']);
assert.strictEqual(pontuar({ celular: '5547988489722', whatsapp_site: null, nota: 4.1, avaliacoes: 12, site: null, email: null }).pontos, 30 + 12 + 6);
assert.strictEqual(pontuar({ celular: null, whatsapp_site: null, nota: null, avaliacoes: 0, site: null, email: null }).pontos, 0);

// Endereço do Google → colunas do CRM
assert.deepStrictEqual(
  enderecoDoGoogle([
    { longText: '1234', types: ['street_number'] },
    { longText: 'Rua XV de Novembro', types: ['route'] },
    { longText: 'Centro', types: ['sublocality_level_1', 'sublocality', 'political'] },
    { longText: 'Blumenau', types: ['administrative_area_level_2', 'political'] },
    { longText: 'Santa Catarina', shortText: 'SC', types: ['administrative_area_level_1', 'political'] },
    { longText: '89010-001', types: ['postal_code'] },
  ]),
  { cep: '89010001', logradouro: 'Rua XV de Novembro', numero: '1234', bairro: 'Centro', cidade: 'Blumenau', uf: 'SC' },
);
assert.deepStrictEqual(enderecoDoGoogle(undefined), { cep: null, logradouro: null, numero: null, bairro: null, cidade: null, uf: null });

// O servidor não lê sites em rede interna
for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
  assert.strictEqual(ipInterno(ip), true, ip);
}
for (const ip of ['8.8.8.8', '172.32.0.1', '2804:14c::1']) assert.strictEqual(ipInterno(ip), false, ip);

// Chave da API: em branco mantém a gravada, limpar apaga, caracteres estranhos são recusados
process.env.SESSION_SECRET ||= 'teste';
const gravada = prepararConfigProspeccao({ chave: 'AIzaSyTeste_123-abc' }, null);
assert.ok(gravada?.chave_cifrada && !gravada.chave_cifrada.includes('AIza'));
assert.deepStrictEqual(prepararConfigProspeccao({ chave: '' }, gravada), { chave_cifrada: gravada!.chave_cifrada });
assert.strictEqual(prepararConfigProspeccao({ limpar: true }, gravada), null);
assert.throws(() => prepararConfigProspeccao({ chave: 'abc"; DROP' }, null), /inválida/);

console.log('prospeccao.test.ts: ok');
