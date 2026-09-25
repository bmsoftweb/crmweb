import crypto from 'crypto';
import { lerConfig } from './config.js';
import { pool } from './db.js';
import { cifrar, decifrar, textoConfig } from './segredo.js';

/**
 * Assinatura eletrônica pela D4Sign (https://docapi.d4sign.com.br).
 *
 * Configuração em Configurações › Assinatura (tabela config, grupo "assinatura", chave
 * "d4sign"), por empresa: ambiente, cofre e as chaves de API (tokenAPI e cryptKey), estas
 * gravadas cifradas. A autenticação da API vai na query string de toda chamada.
 */

interface ConfigD4 {
  ambiente: 'producao' | 'sandbox';
  /** UUID do cofre onde os documentos são guardados na D4Sign */
  cofre: string;
  token_cifrado?: string;
  crypt_cifrado?: string;
  /** Endereço público do CRM (https://...): com ele, cada documento enviado cadastra o webhook */
  url_publica?: string;
  /** "Secret Key MAC" da D4Sign, para conferir o cabeçalho Content-Hmac do webhook */
  hmac_cifrado?: string;
  /** Webhook 2.0 cadastrado no cofre (vale para todos os documentos dele, inclusive os antigos) */
  webhook_cofre?: { cofre: string; url: string; em: string };
}

const ONDE = 'Configurações › Assinatura';
const BASE = { producao: 'https://secure.d4sign.com.br/api/v1', sandbox: 'https://sandbox.d4sign.com.br/api/v1' };

/** Valor que veio da tela → o que vai para o banco. Chave em branco mantém a gravada; ambiente vazio apaga */
export function prepararConfigD4(valor: any, anterior: ConfigD4 | null): ConfigD4 | null {
  const ambiente = valor?.ambiente;
  if (!ambiente) return null;
  if (ambiente !== 'producao' && ambiente !== 'sandbox') throw new Error('Assinatura: ambiente inválido.');
  const cfg: ConfigD4 = { ambiente, cofre: textoConfig(valor?.cofre, 100, 'Assinatura: cofre') };
  const url = textoConfig(valor?.url_publica, 200, 'Assinatura: endereço público').replace(/\/+$/, '');
  if (url && !/^https:\/\/[^\s/]+/i.test(url)) throw new Error('Assinatura: o endereço público do CRM precisa começar com https://');
  if (url) cfg.url_publica = url;
  const segredo = (novo: unknown, antigo?: string) => {
    const t = String(novo ?? '').trim();
    if (t.length > 300) throw new Error('Assinatura: chave grande demais.');
    return t ? cifrar(t) : antigo;
  };
  const token = segredo(valor?.token, anterior?.token_cifrado);
  const crypt = segredo(valor?.crypt, anterior?.crypt_cifrado);
  if (token) cfg.token_cifrado = token;
  if (crypt) cfg.crypt_cifrado = crypt;
  const hmac = segredo(valor?.hmac, anterior?.hmac_cifrado);
  if (hmac) cfg.hmac_cifrado = hmac;
  // O webhook do cofre continua valendo enquanto cofre e endereço não mudarem
  const w = anterior?.webhook_cofre;
  if (w && w.cofre === cfg.cofre && cfg.url_publica && w.url === urlWebhook(cfg.url_publica)) cfg.webhook_cofre = w;
  return cfg;
}

/** Valor do banco → o que a tela recebe (sem as chaves) */
export function configD4Publica(cfg: ConfigD4 | null) {
  if (!cfg) return null;
  const { token_cifrado, crypt_cifrado, hmac_cifrado, ...resto } = cfg;
  return { ...resto, token_definido: Boolean(token_cifrado), crypt_definido: Boolean(crypt_cifrado), hmac_definido: Boolean(hmac_cifrado) };
}

async function credenciais(empresaId: string | number) {
  const cfg: ConfigD4 | null = await lerConfig(String(empresaId), 'assinatura', 'd4sign');
  if (!cfg?.ambiente || !cfg.token_cifrado || !cfg.crypt_cifrado) throw new Error(`D4Sign não configurada: preencha ${ONDE}.`);
  return {
    url_publica: cfg.url_publica,
    webhook_cofre: cfg.webhook_cofre,
    // D4SIGN_URL no .env troca o endereço da API (testes, ou mudança de domínio da D4Sign)
    base: process.env.D4SIGN_URL || BASE[cfg.ambiente],
    cofre: cfg.cofre,
    auth: `tokenAPI=${encodeURIComponent(decifrar(cfg.token_cifrado, ONDE))}&cryptKey=${encodeURIComponent(decifrar(cfg.crypt_cifrado, ONDE))}`,
  };
}

/** Chamada à API; erro da D4Sign vira exceção com a mensagem dela */
async function chamar(empresaId: string | number, metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<any> {
  const c = await credenciais(empresaId);
  let r: Response;
  try {
    r = await fetch(`${c.base}${caminho}${caminho.includes('?') ? '&' : '?'}${c.auth}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err: any) {
    throw new Error(`D4Sign inacessível (${err?.cause?.code || err?.message || err}).`);
  }
  const texto = await r.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta sem JSON: vai no erro abaixo
  }
  if (!r.ok || json?.message === 'Invalid token' || json?.error) {
    throw new Error(`D4Sign: ${json?.message || json?.error || `HTTP ${r.status}`}`.slice(0, 250));
  }
  return json;
}

/** Cofres da conta (teste de conexão e escolha do cofre na tela) */
export async function listarCofres(empresaId: string): Promise<{ uuid: string; nome: string }[]> {
  const r = await chamar(empresaId, 'GET', '/safes');
  return (Array.isArray(r) ? r : [r]).filter(Boolean).map((s: any) => ({ uuid: s['uuid-safe'] ?? s.uuid_safe ?? s.uuid, nome: s['name-safe'] ?? s.name_safe ?? s.name })).filter((s) => s.uuid);
}

/** Teste da configuração: cofres da conta e se o cofre gravado está entre eles */
export async function verificarConta(empresaId: string) {
  const { cofre } = await credenciais(empresaId);
  const cofres = await listarCofres(empresaId);
  const doCofre = cofres.find((c) => c.uuid === cofre);
  return {
    cofres,
    cofre: !cofre ? 'Nenhum cofre escolhido.' : doCofre ? `Cofre "${doCofre.nome}" encontrado.` : 'O cofre gravado não existe nesta conta (ou o token não tem acesso a ele).',
    cofre_ok: Boolean(doCofre),
  };
}

/**
 * Sobe o PDF para o cofre, cadastra os signatários (assinatura por e-mail) e dispara o
 * envio. Devolve o UUID do documento na D4Sign.
 */
export async function enviarParaAssinatura(
  empresaId: string,
  pdf: Buffer,
  nomeArquivo: string,
  emails: string[],
  mensagem: string,
): Promise<string> {
  const { cofre, url_publica, webhook_cofre } = await credenciais(empresaId);
  if (!cofre) throw new Error(`D4Sign: escolha o cofre em ${ONDE}.`);
  const up = await chamar(empresaId, 'POST', `/documents/${encodeURIComponent(cofre)}/uploadbinary`, {
    base64_binary_file: pdf.toString('base64'),
    mime_type: 'application/pdf',
    name: nomeArquivo,
  });
  const uuid = up?.uuid;
  if (!uuid) throw new Error('D4Sign: o envio do arquivo não devolveu o identificador do documento.');
  await chamar(empresaId, 'POST', `/documents/${uuid}/createlist`, {
    signers: emails.map((email) => ({
      email,
      act: '1', // assinar
      foreign: '0',
      certificadoicpbr: '0',
      assinatura_presencial: '0',
      docauth: '0',
      docauthandselfie: '0',
      embed_methodauth: 'email',
      embed_smsnumber: '',
      upload_allow: '0',
      upload_obs: '',
    })),
  });
  // Webhook: a D4Sign avisa o CRM a cada assinatura, conclusão ou cancelamento. Sem ele (ou se
  // o cadastro falhar) a rotina de hora em hora consulta a situação, como antes.
  // Com o webhook 2.0 no cofre o aviso já está garantido: poupa uma chamada por documento.
  const noCofre = webhook_cofre?.cofre === cofre && Boolean(url_publica) && webhook_cofre?.url === urlWebhook(url_publica!);
  if (url_publica && !noCofre) {
    await chamar(empresaId, 'POST', `/documents/${uuid}/webhooks`, { url: urlWebhook(url_publica) }).catch((err) =>
      console.warn(`D4Sign: webhook não cadastrado no documento ${uuid}: ${err.message}`),
    );
  }
  await chamar(empresaId, 'POST', `/documents/${uuid}/sendtosigner`, { message: mensagem, skip_email: '0', workflow: '0' });
  return uuid;
}

/** Situação do documento: 1 processando, 2 aguardando signatários, 3 aguardando assinaturas, 4 finalizado, 5 arquivado, 6 cancelado, 7 editando */
export async function situacaoDocumento(empresaId: string, uuid: string): Promise<{ statusId: number; statusName: string }> {
  const r = await chamar(empresaId, 'GET', `/documents/${uuid}`);
  const d = Array.isArray(r) ? r[0] : r;
  return { statusId: Number(d?.statusId), statusName: String(d?.statusName ?? '') };
}

/** Signatários com a situação de cada um (melhor esforço: sem essa lista, vale a situação do documento) */
export async function signatariosDocumento(empresaId: string, uuid: string): Promise<{ email: string; nome: string; assinado: boolean; assinado_em: string | null }[] | null> {
  try {
    const r = await chamar(empresaId, 'GET', `/documents/${uuid}/list`);
    // A D4Sign devolve o documento (às vezes dentro de um array) e "list" como objeto (1 signatário) ou array
    const lista = (Array.isArray(r) ? r[0]?.list : r?.list) ?? [];
    return (Array.isArray(lista) ? lista : [lista]).map((s: any) => ({
      email: s.email,
      nome: s.user_name || '',
      assinado: String(s.signed) === '1',
      assinado_em: s.signed_date || null,
    }));
  } catch {
    return null;
  }
}

/** Cancela o documento na D4Sign (os links de assinatura deixam de valer) */
export async function cancelarDocumento(empresaId: string, uuid: string, comentario: string): Promise<void> {
  await chamar(empresaId, 'POST', `/documents/${uuid}/cancel`, { comment: comentario });
}

/** Reenvia o link de assinatura a um signatário que ainda não assinou */
export async function reenviarLink(empresaId: string, uuid: string, email: string): Promise<void> {
  const r = await chamar(empresaId, 'GET', `/documents/${uuid}/list`);
  const lista = (Array.isArray(r) ? r[0]?.list : r?.list) ?? [];
  const s = (Array.isArray(lista) ? lista : [lista]).find((x: any) => String(x?.email).toLowerCase() === email.toLowerCase());
  if (!s?.key_signer) throw new Error(`D4Sign: ${email} não é signatário deste documento.`);
  if (String(s.signed) === '1') throw new Error(`${email} já assinou.`);
  await chamar(empresaId, 'POST', `/documents/${uuid}/resend`, { email: s.email, key_signer: s.key_signer });
}

/** Baixa o PDF assinado (a D4Sign devolve um link temporário) */
export async function baixarAssinado(empresaId: string, uuid: string): Promise<Buffer> {
  const r = await chamar(empresaId, 'POST', `/documents/${uuid}/download`, { type: 'PDF', language: 'pt' });
  if (!r?.url) throw new Error('D4Sign: o download não devolveu o link do arquivo.');
  const arq = await fetch(r.url, { signal: AbortSignal.timeout(90_000) });
  if (!arq.ok) throw new Error(`D4Sign: falha ao baixar o arquivo assinado (HTTP ${arq.status}).`);
  return Buffer.from(await arq.arrayBuffer());
}

// ------------------------------------------------------------
// Webhook (POSTBack): a D4Sign chama o CRM quando algo muda no documento
// ------------------------------------------------------------

export const CAMINHO_WEBHOOK = '/api/webhooks/d4sign';
const urlWebhook = (urlPublica: string) => `${urlPublica}${CAMINHO_WEBHOOK}`;

/**
 * Webhook 2.0: cadastra (ou atualiza) a URL do CRM no cofre dos contratos. Precisa do
 * "Webhook 2.0" ativado na conta da D4Sign. Confere na listagem e grava na configuração.
 */
export async function cadastrarWebhookCofre(empresaId: string): Promise<{ url: string; conferido: boolean }> {
  const c = await credenciais(empresaId);
  if (!c.cofre) throw new Error(`D4Sign: escolha o cofre em ${ONDE}.`);
  if (!c.url_publica) throw new Error(`D4Sign: preencha o endereço público do CRM em ${ONDE}.`);
  const url = urlWebhook(c.url_publica);
  await chamar(empresaId, 'POST', '/webhooks/v2/', { type: 'cofre', uuid: c.cofre, url });
  // A listagem não tem formato documentado: basta a URL aparecer nela
  const lista = await chamar(empresaId, 'GET', `/webhooks/v2/?type=cofre&uuid=${encodeURIComponent(c.cofre)}`).catch(() => null);
  const conferido = JSON.stringify(lista ?? '').replaceAll('\\/', '/').includes(url);
  const [agora] = await pool.query<any[]>("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS em");
  const cfg: ConfigD4 = { ...(await lerConfig(empresaId, 'assinatura', 'd4sign')), webhook_cofre: { cofre: c.cofre, url, em: agora[0].em } };
  await pool.query("UPDATE config SET valor = ? WHERE empresa_id = ? AND grupo = 'assinatura' AND chave = 'd4sign'", [JSON.stringify(cfg), empresaId]);
  return { url, conferido };
}

/** A empresa usa o webhook? (então a consulta de hora em hora vira só uma conferência diária) */
export async function usaWebhook(empresaId: string): Promise<boolean> {
  const cfg: ConfigD4 | null = await lerConfig(empresaId, 'assinatura', 'd4sign');
  return Boolean(cfg?.url_publica);
}

/**
 * Confere o cabeçalho "Content-Hmac: sha256=<hex>" (HMAC-SHA256 do UUID do documento com a
 * Secret Key MAC). Sem chave configurada, não há o que conferir: o aviso é aceito, e é
 * seguro porque o CRM não confia no conteúdo, só consulta a situação na própria D4Sign.
 */
export async function hmacValido(empresaId: string, uuid: string, cabecalho: string | undefined): Promise<boolean | null> {
  const cfg: ConfigD4 | null = await lerConfig(empresaId, 'assinatura', 'd4sign');
  if (!cfg?.hmac_cifrado) return null;
  const esperado = crypto.createHmac('sha256', decifrar(cfg.hmac_cifrado, ONDE)).update(uuid).digest('hex');
  const recebido = String(cabecalho ?? '').replace(/^sha256=/i, '').trim().toLowerCase();
  return recebido.length === esperado.length && crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

/** Campos do POST da D4Sign: vem como form-data (multipart), mas aceita também urlencoded e JSON */
export function camposWebhook(contentType: string, corpo: string): Record<string, string> {
  const fronteira = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (fronteira) {
    const campos: Record<string, string> = {};
    for (const parte of corpo.split(`--${fronteira[1] || fronteira[2]}`)) {
      const fim = parte.indexOf('\r\n\r\n');
      const nome = /name="([^"]*)"/i.exec(parte.slice(0, fim));
      if (fim >= 0 && nome) campos[nome[1]] = parte.slice(fim + 4).replace(/\r\n$/, '');
    }
    return campos;
  }
  if (/json/i.test(contentType)) {
    try {
      const j = JSON.parse(corpo);
      return Object.fromEntries(Object.entries(j ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(corpo));
}
