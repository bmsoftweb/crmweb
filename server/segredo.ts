import crypto from 'crypto';

/**
 * Senhas e tokens das configurações (tabela config) gravados cifrados com AES-256-GCM.
 * A chave sai do SESSION_SECRET: trocá-lo obriga a redigitar os segredos na tela.
 */
const chave = () => crypto.createHash('sha256').update(`crmweb-config:${process.env.SESSION_SECRET || ''}`).digest();

export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

/** `onde` entra na mensagem de erro, ex.: "Configurações › E-mail" */
export function decifrar(cifrado: string, onde: string): string {
  try {
    const [iv, tag, dados] = cifrado.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
  } catch {
    throw new Error(`Não foi possível ler o segredo gravado (o SESSION_SECRET mudou?). Digite-o de novo em ${onde}.`);
  }
}

/** Texto aparado com limite de tamanho, para os campos das configurações */
export function textoConfig(v: unknown, max: number, rotulo: string): string {
  const t = String(v ?? '').trim();
  if (t.length > max) throw new Error(`${rotulo}: valor grande demais.`);
  return t;
}
