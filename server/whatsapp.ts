import crypto from 'crypto';
import { pool } from './db.js';
import { VARIAVEIS, personalizar } from './campanhas.js';
import { lerConfig } from './config.js';
import { cifrar, decifrar, textoConfig } from './segredo.js';

/**
 * WhatsApp pela Z-API ou pela Evolution API.
 *
 * A configuração vem de Configurações › WhatsApp (tabela config, grupo "whatsapp", chave
 * "provedor"), por empresa. Empresa sem configuração usa o .env:
 *   WHATSAPP_PROVEDOR=zapi       ZAPI_INSTANCIA, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
 *   WHATSAPP_PROVEDOR=evolution  EVOLUTION_URL, EVOLUTION_INSTANCIA, EVOLUTION_APIKEY
 *   WHATSAPP_INTERVALO_SEGUNDOS  pausa entre mensagens das campanhas (padrão 5)
 *
 * Envio das campanhas: a cada minuto pega os disparos pendentes já vencidos de campanhas em
 * execução com canal WhatsApp ou multicanal e envia um por vez, com intervalo entre as
 * mensagens (disparo em rajada é o que mais faz número não oficial ser bloqueado).
 * Campanha pausada não envia; os disparos dela esperam a volta para "em execução".
 */

/**
 * Falha do provedor (fora do ar, chave errada, número desconectado, sem configuração): o
 * disparo continua pendente e a empresa sai do ciclo, para a fila não virar "falhou" inteira.
 * Erro do destinatário (telefone inválido, número sem WhatsApp) é Error comum e marca só
 * aquele disparo.
 */
export class ErroProvedor extends Error {}

/** Como fica no banco. Tokens só cifrados, e nunca voltam para o navegador */
interface ConfigWhats {
  provedor: 'zapi' | 'evolution';
  /** Evolution: endereço do servidor */
  url?: string;
  instancia: string;
  intervalo: number;
  /** Evolution: apikey. Z-API: token da instância */
  token_cifrado?: string;
  /** Z-API: token de segurança da conta */
  client_token_cifrado?: string;
  /** Recebimento (webhook da Evolution): token do endereço, que nunca volta para a tela */
  webhook_token?: string;
  /** Recebimento ativado: endereço público do CRM usado e quando */
  webhook?: { origem: string; em: string };
}

/** Credenciais prontas para usar, já decifradas */
interface Credenciais {
  provedor: 'zapi' | 'evolution';
  url: string;
  instancia: string;
  token: string;
  clientToken: string;
  intervalo: number;
}

const ONDE = 'Configurações › WhatsApp';

/** Valor que veio da tela → o que vai para o banco. Token em branco mantém o gravado; provedor vazio apaga */
export function prepararConfigWhats(valor: any, anterior: ConfigWhats | null): ConfigWhats | null {
  const provedor = valor?.provedor;
  if (!provedor) return null;
  if (provedor !== 'zapi' && provedor !== 'evolution') throw new Error('WhatsApp: provedor inválido.');
  const intervalo = valor?.intervalo === '' || valor?.intervalo == null ? 5 : Number(valor.intervalo);
  if (!Number.isInteger(intervalo) || intervalo < 0 || intervalo > 600) throw new Error('WhatsApp: intervalo deve ser de 0 a 600 segundos.');
  const cfg: ConfigWhats = { provedor, instancia: textoConfig(valor?.instancia, 200, 'WhatsApp: instância'), intervalo };
  if (!cfg.instancia) throw new Error('WhatsApp: informe a instância.');
  if (provedor === 'evolution') {
    cfg.url = textoConfig(valor?.url, 255, 'WhatsApp: endereço').replace(/\/+$/, '');
    if (!/^https?:\/\/\S+$/.test(cfg.url)) throw new Error('WhatsApp: informe o endereço do servidor Evolution (http://... ou https://...).');
  }
  // Troca de provedor descarta os tokens do anterior
  const mesmo = anterior?.provedor === provedor ? anterior : null;
  const segredo = (novo: unknown, antigo?: string) => {
    const t = String(novo ?? '');
    if (t.length > 500) throw new Error('WhatsApp: token grande demais.');
    return t ? cifrar(t) : antigo;
  };
  const token = segredo(valor?.token, mesmo?.token_cifrado);
  if (token) cfg.token_cifrado = token;
  if (provedor === 'zapi') {
    const client = segredo(valor?.client_token, mesmo?.client_token_cifrado);
    if (client) cfg.client_token_cifrado = client;
  }
  // O recebimento continua valendo enquanto servidor e instância forem os mesmos
  if (mesmo?.webhook_token) cfg.webhook_token = mesmo.webhook_token;
  if (mesmo?.webhook && mesmo.url === cfg.url && mesmo.instancia === cfg.instancia) cfg.webhook = mesmo.webhook;
  return cfg;
}

/** Valor do banco → o que a tela recebe (sem os tokens) */
export function configWhatsPublica(cfg: ConfigWhats | null) {
  if (!cfg) return null;
  const { token_cifrado, client_token_cifrado, webhook_token, ...resto } = cfg;
  return { ...resto, token_definido: Boolean(token_cifrado), client_token_definido: Boolean(client_token_cifrado) };
}

/** Credenciais da empresa: a configuração da tela, ou o .env */
async function credenciais(empresaId: string | number): Promise<Credenciais> {
  const cfg: ConfigWhats | null = await lerConfig(String(empresaId), 'whatsapp', 'provedor');
  const falta = (o: string) => {
    throw new ErroProvedor(`WhatsApp: ${o} não configurado. Preencha ${ONDE}.`);
  };
  if (cfg?.provedor) {
    const token = cfg.token_cifrado ? decifrar(cfg.token_cifrado, ONDE) : falta(cfg.provedor === 'zapi' ? 'token da instância' : 'apikey');
    const clientToken = cfg.provedor === 'zapi' ? (cfg.client_token_cifrado ? decifrar(cfg.client_token_cifrado, ONDE) : falta('token de segurança')) : '';
    return { provedor: cfg.provedor, url: cfg.url || '', instancia: cfg.instancia, token, clientToken, intervalo: cfg.intervalo };
  }
  const env = (nome: string) => process.env[nome] || falta(`${nome} (.env)`);
  const provedor = process.env.WHATSAPP_PROVEDOR;
  const segundos = Number(process.env.WHATSAPP_INTERVALO_SEGUNDOS ?? 5);
  const intervalo = Number.isFinite(segundos) ? segundos : 5;
  if (provedor === 'zapi') {
    return { provedor, url: '', instancia: env('ZAPI_INSTANCIA'), token: env('ZAPI_TOKEN'), clientToken: env('ZAPI_CLIENT_TOKEN'), intervalo };
  }
  if (provedor === 'evolution') {
    return { provedor, url: env('EVOLUTION_URL').replace(/\/+$/, ''), instancia: env('EVOLUTION_INSTANCIA'), token: env('EVOLUTION_APIKEY'), clientToken: '', intervalo };
  }
  return falta('provedor');
}

/** Só dígitos, com o DDI 55 quando vier só DDD + número */
export function telefoneWhatsApp(bruto: string | null | undefined): string {
  let t = String(bruto ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (t.length === 10 || t.length === 11) t = `55${t}`;
  if (t.length < 12 || t.length > 13) throw new Error(`Telefone inválido para WhatsApp: "${bruto ?? ''}".`);
  return t;
}

/** Endereço e cabeçalho de autenticação da rota no provedor da credencial */
function endereco(c: Credenciais, rota: { zapi: string; evolution: string }) {
  return c.provedor === 'zapi'
    ? { url: `https://api.z-api.io/instances/${encodeURIComponent(c.instancia)}/token/${encodeURIComponent(c.token)}/${rota.zapi}`, headers: { 'Client-Token': c.clientToken } }
    : { url: `${c.url}/${rota.evolution}/${encodeURIComponent(c.instancia)}`, headers: { apikey: c.token } };
}

async function requisitar(url: string, init: RequestInit): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch (err: any) {
    throw new ErroProvedor(`WhatsApp: provedor inacessível (${err?.cause?.code || err?.message || err}).`);
  }
  if (!r.ok) {
    const resposta = await r.text().catch(() => '');
    const msg = `HTTP ${r.status}: ${resposta.slice(0, 200) || r.statusText}`;
    // 400/422: o provedor recusou este destinatário; o resto é problema do provedor
    throw r.status === 400 || r.status === 422 ? new Error(msg) : new ErroProvedor(`WhatsApp: ${msg}`);
  }
  return r;
}

/** Envio: cada provedor tem o próprio endereço e formato, passados aqui já montados */
async function enviar(c: Credenciais, zapi: { rota: string; corpo: unknown }, evolution: { rota: string; corpo: unknown }): Promise<any> {
  const { url, headers } = endereco(c, { zapi: zapi.rota, evolution: `message/${evolution.rota}` });
  const r = await requisitar(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(c.provedor === 'zapi' ? zapi.corpo : evolution.corpo),
  });
  return r.json().catch(() => ({}));
}

const textoPara = (c: Credenciais, telefone: string, texto: string) =>
  enviar(c, { rota: 'send-text', corpo: { phone: telefone, message: texto } }, { rota: 'sendText', corpo: { number: telefone, text: texto } });

/** Quem e o quê, para registrar a mensagem enviada na conversa */
interface Registro {
  pessoa_id?: number | null;
  usuario_id?: number | null;
  disparo_id?: number | null;
}

export async function enviarWhatsApp(empresaId: string | number, telefone: string, texto: string, reg: Registro = {}): Promise<void> {
  const resposta = await textoPara(await credenciais(empresaId), telefone, texto);
  await registrarEnviada(empresaId, telefone, resposta, { ...reg, tipo: 'texto', texto });
}

/** Envia um PDF como documento, com legenda */
export async function enviarPdfWhatsApp(
  empresaId: string | number,
  telefone: string,
  pdf: Buffer,
  nomeArquivo: string,
  legenda: string,
  reg: Registro = {},
): Promise<void> {
  const base64 = pdf.toString('base64');
  const resposta = await enviar(
    await credenciais(empresaId),
    { rota: 'send-document/pdf', corpo: { phone: telefone, document: `data:application/pdf;base64,${base64}`, fileName: nomeArquivo, caption: legenda } },
    { rota: 'sendMedia', corpo: { number: telefone, mediatype: 'document', mimetype: 'application/pdf', media: base64, fileName: nomeArquivo, caption: legenda } },
  );
  await registrarEnviada(empresaId, telefone, resposta, { ...reg, tipo: 'documento', texto: legenda || null, arquivo_nome: nomeArquivo });
}

// ------------------------------------------------------------
// Conversas: mensagens enviadas e recebidas (tabela whatsapp_mensagens)
// ------------------------------------------------------------

/** Só os dígitos do JID do WhatsApp (5547...@s.whatsapp.net, ou com :dispositivo) */
const digitosDoJid = (jid: string) => jid.split('@')[0].split(':')[0].replace(/\D/g, '');

/**
 * Chave para achar a pessoa pelo telefone: DDD + 8 últimos dígitos. Iguala o número com e sem
 * o 9 (o WhatsApp costuma omiti-lo) e com ou sem DDI 55. comDdi: o número já vem com DDI
 * (JID do WhatsApp). Número de fora do Brasil vale inteiro. null quando não dá para comparar.
 */
export function chaveTelefone(bruto: string | null | undefined, comDdi = false): string | null {
  let t = String(bruto ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (comDdi || t.length >= 12) {
    if (!t.startsWith('55')) return t.length >= 8 ? `+${t}` : null;
    t = t.slice(2);
  }
  return t.length === 10 || t.length === 11 ? t.slice(0, 2) + t.slice(-8) : null;
}

/** Pessoa da empresa com esse telefone (a de menor id, se houver mais de uma) */
async function pessoaDoTelefone(empresaId: string | number, telefone: string): Promise<number | null> {
  const chave = chaveTelefone(telefone, true);
  if (!chave) return null;
  const [rows] = await pool.query<any[]>(
    "SELECT id, telefone FROM pessoas WHERE empresa_id = ? AND RIGHT(REGEXP_REPLACE(telefone, '[^0-9]', ''), 8) = ? ORDER BY id",
    [empresaId, chave.slice(-8)],
  );
  // Metade dos cadastros importados não tem DDD: sem um com DDD igual, vale o que bate nos 8 dígitos.
  // ponytail: pode ligar à pessoa errada de outro DDD com o mesmo número; cadastrar o DDD resolve
  const semDdd = (t: string) => /^\d{8,9}$/.test(String(t).replace(/\D/g, '').replace(/^0+/, ''));
  const achada = rows.find((p) => chaveTelefone(p.telefone) === chave) ?? (chave.startsWith('+') ? undefined : rows.find((p) => semDdd(p.telefone)));
  return achada?.id ?? null;
}

/**
 * Passa ao disparo da campanha o que o WhatsApp informou da mensagem: entregue, lida ou falhou.
 * Nunca volta atrás (lido não vira entregue).
 */
async function repassarAoDisparo(empresaId: string | number, waId: string) {
  await pool.query(
    `UPDATE disparos_mensagens d JOIN whatsapp_mensagens w ON w.disparo_id = d.id
        SET d.mensagem_erro = IF(w.situacao = 'falhou' AND d.situacao = 'enviado', 'O WhatsApp não entregou a mensagem.', d.mensagem_erro),
            d.entregue_em = IF(w.situacao IN ('entregue', 'lida'), COALESCE(d.entregue_em, NOW()), d.entregue_em),
            d.lido_em = IF(w.situacao = 'lida', COALESCE(d.lido_em, NOW()), d.lido_em),
            d.situacao = CASE
              WHEN w.situacao = 'lida' THEN 'lido'
              WHEN w.situacao = 'entregue' AND d.situacao = 'enviado' THEN 'entregue'
              WHEN w.situacao = 'falhou' AND d.situacao = 'enviado' THEN 'falhou'
              ELSE d.situacao END
      WHERE w.empresa_id = ? AND w.wa_id = ? AND d.situacao IN ('enviado', 'entregue')`,
    [empresaId, waId],
  );
}

/**
 * Registra a mensagem enviada pelo CRM. O id devolvido pelo provedor liga os avisos de
 * entrega/leitura a ela; o JID da resposta é o número como o WhatsApp o conhece (às vezes sem o 9).
 * Falha aqui não desfaz o envio: só fica no log.
 */
async function registrarEnviada(
  empresaId: string | number,
  telefone: string,
  resposta: any,
  m: Registro & { tipo: string; texto: string | null; arquivo_nome?: string },
) {
  try {
    const waId: string | null = resposta?.key?.id ?? resposta?.messageId ?? null;
    const jid = resposta?.key?.remoteJid;
    const numero = typeof jid === 'string' && jid.endsWith('@s.whatsapp.net') ? digitosDoJid(jid) : telefone;
    const pessoaId = m.pessoa_id ?? (await pessoaDoTelefone(empresaId, numero));
    await pool.query(
      `INSERT INTO whatsapp_mensagens
         (empresa_id, pessoa_id, telefone, direcao, tipo, texto, arquivo_nome, wa_id, situacao, disparo_id, usuario_id, vista, data_hora)
       VALUES (?, ?, ?, 'enviada', ?, ?, ?, ?, 'enviada', ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE pessoa_id = COALESCE(pessoa_id, VALUES(pessoa_id)),
         disparo_id = COALESCE(disparo_id, VALUES(disparo_id)), usuario_id = COALESCE(usuario_id, VALUES(usuario_id)),
         arquivo_nome = COALESCE(arquivo_nome, VALUES(arquivo_nome))`,
      [empresaId, pessoaId, numero, m.tipo, m.texto, m.arquivo_nome ?? null, waId, m.disparo_id ?? null, m.usuario_id ?? null],
    );
    // O aviso de entrega pode ter chegado antes deste registro
    if (waId && m.disparo_id) await repassarAoDisparo(empresaId, waId);
  } catch (err: any) {
    console.error(`WhatsApp: mensagem enviada para ${telefone} não registrada: ${err.message}`);
  }
}

/** Tipo, texto e arquivo de uma mensagem do WhatsApp (Baileys); null para o que não é conversa */
export function conteudoMensagem(m: any): { tipo: string; texto: string | null; arquivo: string | null } | null {
  if (!m || typeof m !== 'object') return null;
  // Mensagem temporária / visualização única / documento com legenda: o conteúdo vem embrulhado
  const dentro = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m.documentWithCaptionMessage?.message;
  if (dentro) return conteudoMensagem(dentro);
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  if (m.conversation) return { tipo: 'texto', texto: txt(m.conversation), arquivo: null };
  if (m.extendedTextMessage) return { tipo: 'texto', texto: txt(m.extendedTextMessage.text), arquivo: null };
  if (m.imageMessage) return { tipo: 'imagem', texto: txt(m.imageMessage.caption), arquivo: null };
  if (m.videoMessage) return { tipo: 'video', texto: txt(m.videoMessage.caption), arquivo: null };
  if (m.audioMessage) return { tipo: 'audio', texto: null, arquivo: null };
  if (m.documentMessage) return { tipo: 'documento', texto: txt(m.documentMessage.caption), arquivo: txt(m.documentMessage.fileName ?? m.documentMessage.title) };
  if (m.stickerMessage) return { tipo: 'figurinha', texto: null, arquivo: null };
  if (m.locationMessage || m.liveLocationMessage) {
    const l = m.locationMessage ?? m.liveLocationMessage;
    return { tipo: 'localizacao', texto: txt([l.name, l.address].filter(Boolean).join(' — ')) ?? `${l.degreesLatitude}, ${l.degreesLongitude}`, arquivo: null };
  }
  if (m.contactMessage) return { tipo: 'contato', texto: txt(m.contactMessage.displayName), arquivo: null };
  if (m.contactsArrayMessage) return { tipo: 'contato', texto: txt(m.contactsArrayMessage.displayName), arquivo: null };
  // Reação, apagar, edição, chaves de criptografia: não são mensagens da conversa
  const ignorar = ['reactionMessage', 'protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo', 'editedMessage', 'pollUpdateMessage'];
  return Object.keys(m).some((k) => !ignorar.includes(k)) ? { tipo: 'outro', texto: null, arquivo: null } : null;
}

/** Aviso de mensagem nova (recebida, ou enviada pelo celular/pelo CRM) */
async function gravarMensagem(empresaId: string | number, d: any) {
  const key = d?.key ?? {};
  // Com o endereçamento novo (LID), o número vem no remoteJidAlt/senderPn
  const jid = [key.remoteJid, key.remoteJidAlt, key.senderPn].find((j) => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));
  if (!jid || !key.id) return; // grupo, status, canal
  const c = conteudoMensagem(d.message);
  if (!c) return;
  const telefone = digitosDoJid(jid);
  const recebida = !key.fromMe;
  const pessoaId = await pessoaDoTelefone(empresaId, telefone);
  const ts = Number(d.messageTimestamp) || null;
  await pool.query(
    `INSERT INTO whatsapp_mensagens (empresa_id, pessoa_id, telefone, direcao, tipo, texto, arquivo_nome, wa_id, situacao, vista, data_hora)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(FROM_UNIXTIME(?), NOW()))
     ON DUPLICATE KEY UPDATE pessoa_id = COALESCE(pessoa_id, VALUES(pessoa_id))`,
    [empresaId, pessoaId, telefone, recebida ? 'recebida' : 'enviada', c.tipo, c.texto, c.arquivo, key.id, recebida ? 'recebida' : 'enviada', recebida ? 0 : 1, ts],
  );
}

/** Situação que a Evolution informa (texto, ou o número do Baileys) → a da tabela */
const SITUACOES: Record<string, string> = {
  SERVER_ACK: 'enviada',
  '2': 'enviada',
  DELIVERY_ACK: 'entregue',
  '3': 'entregue',
  READ: 'lida',
  '4': 'lida',
  PLAYED: 'lida',
  '5': 'lida',
  ERROR: 'falhou',
  '0': 'falhou',
};

/** Aviso de entrega/leitura de uma mensagem enviada. Só avança (lida não volta a entregue) */
async function atualizarSituacao(empresaId: string | number, d: any) {
  const waId = d?.keyId ?? d?.key?.id ?? d?.id;
  const situacao = SITUACOES[String(d?.status ?? d?.update?.status ?? '')];
  if (!waId || !situacao) return;
  const [r] = await pool.query<any>(
    `UPDATE whatsapp_mensagens SET situacao = ?
      WHERE empresa_id = ? AND wa_id = ? AND direcao = 'enviada'
        AND (? = 'falhou' OR FIELD(situacao, 'pendente', 'enviada', 'entregue', 'lida') < FIELD(?, 'pendente', 'enviada', 'entregue', 'lida'))`,
    [situacao, empresaId, waId, situacao, situacao],
  );
  if (r.affectedRows) await repassarAoDisparo(empresaId, waId);
}

/** Empresa dona do token do endereço do webhook */
async function empresaDoToken(token: string): Promise<{ empresaId: number; cfg: ConfigWhats } | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const [rows] = await pool.query<any[]>("SELECT empresa_id, valor FROM config WHERE grupo = 'whatsapp' AND chave = 'provedor' AND empresa_id IS NOT NULL");
  for (const r of rows) {
    let cfg: ConfigWhats | null = null;
    try {
      cfg = JSON.parse(r.valor);
    } catch {
      continue;
    }
    if (cfg?.webhook_token?.length === token.length && crypto.timingSafeEqual(Buffer.from(cfg.webhook_token), Buffer.from(token))) {
      return { empresaId: r.empresa_id, cfg };
    }
  }
  return null;
}

/**
 * Aviso da Evolution (webhook, rota pública): mensagens novas e mudanças de situação.
 * O token do endereço identifica a empresa; aviso de outra instância é ignorado.
 */
export async function receberAvisoEvolution(token: string, corpo: any): Promise<void> {
  const dono = await empresaDoToken(token);
  if (!dono) throw Object.assign(new Error('Endereço de recebimento desconhecido.'), { status: 404 });
  if (corpo?.instance && corpo.instance !== dono.cfg.instancia) return;
  const evento = String(corpo?.event ?? '').toLowerCase().replace(/_/g, '.');
  const itens = Array.isArray(corpo?.data) ? corpo.data : [corpo?.data];
  for (const d of itens) {
    if (evento === 'messages.upsert' || evento === 'send.message') await gravarMensagem(dono.empresaId, d);
    else if (evento === 'messages.update') await atualizarSituacao(dono.empresaId, d);
  }
}

/**
 * Liga o recebimento: cadastra na Evolution o endereço do CRM (origem = endereço público de
 * onde a tela foi aberta) para os avisos de mensagens novas e de entrega/leitura.
 */
export async function ativarRecebimento(empresaId: string, origem: string): Promise<{ origem: string; em: string }> {
  const cfg: ConfigWhats | null = await lerConfig(empresaId, 'whatsapp', 'provedor');
  if (!cfg?.provedor) throw new Error(`WhatsApp: grave o provedor em ${ONDE} antes de ativar o recebimento.`);
  if (cfg.provedor !== 'evolution') throw new Error('WhatsApp: por enquanto o recebimento de mensagens só funciona com a Evolution API.');
  let base: URL;
  try {
    base = new URL(String(origem));
  } catch {
    throw new Error('WhatsApp: endereço do CRM inválido.');
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(base.hostname)) {
    throw new Error('WhatsApp: a Evolution não alcança este endereço (rede local). Abra o CRM pelo endereço público (o da Vercel) e ative o recebimento de lá.');
  }
  const c = await credenciais(empresaId);
  const token = cfg.webhook_token || crypto.randomBytes(24).toString('hex');
  const url = `${base.origin}/api/webhooks/evolution/${token}`;
  await requisitar(`${c.url}/webhook/set/${encodeURIComponent(c.instancia)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: c.token },
    body: JSON.stringify({
      webhook: { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'] },
    }),
  });
  const [agora] = await pool.query<any[]>("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS em");
  const webhook = { origem: base.origin, em: agora[0].em };
  await pool.query("UPDATE config SET valor = ? WHERE empresa_id = ? AND grupo = 'whatsapp' AND chave = 'provedor'", [
    JSON.stringify({ ...cfg, webhook_token: token, webhook }),
    empresaId,
  ]);
  return webhook;
}

/**
 * Se o número está conectado. Evolution: pelo connectionStatus de instance/fetchInstances;
 * o instance/connectionState (2.3.7) continua dizendo "open" depois de um logout.
 */
async function conectadoNoProvedor(c: Credenciais): Promise<boolean> {
  if (c.provedor === 'zapi') {
    const { url, headers } = endereco(c, { zapi: 'status', evolution: '' });
    const r: any = await (await requisitar(url, { headers })).json().catch(() => ({}));
    return r?.connected === true;
  }
  const url = `${c.url}/instance/fetchInstances?instanceName=${encodeURIComponent(c.instancia)}`;
  const r: any = await (await requisitar(url, { headers: { apikey: c.token } })).json().catch(() => null);
  const inst = Array.isArray(r) ? r.find((i: any) => (i?.name ?? i?.instance?.instanceName) === c.instancia) : null;
  if (!inst) throw new ErroProvedor(`WhatsApp: instância "${c.instancia}" não encontrada na Evolution.`);
  return (inst.connectionStatus ?? inst.instance?.status) === 'open';
}

/** Consulta no provedor se o número está conectado; erro só quando o provedor falha (fora do ar, chave errada) */
export async function testarWhatsApp(empresaId: string): Promise<{ conectado: boolean; mensagem: string }> {
  const c = await credenciais(empresaId);
  const conectado = await conectadoNoProvedor(c);
  const nome = c.provedor === 'zapi' ? 'Z-API' : 'Evolution';
  return { conectado, mensagem: conectado ? `${nome}: número conectado.` : `${nome}: o provedor respondeu, mas o número está desconectado. Use Conectar WhatsApp.` };
}

/**
 * QR Code para conectar o número (a tela chama de novo a cada poucos segundos até conectar).
 * Evolution: instance/connect devolve o QR em base64, ou o estado "open" se já conectado.
 * Z-API: qr-code/image devolve o QR em base64, ou connected: true se já conectado.
 */
export async function conectarWhatsApp(empresaId: string): Promise<{ conectado: boolean; qrcode?: string }> {
  const c = await credenciais(empresaId);
  const { url, headers } = endereco(c, { zapi: 'qr-code/image', evolution: 'instance/connect' });
  const pedirQr = async () => (await requisitar(url, { headers })).json().catch(() => ({}));
  let r: any = await pedirQr();
  const dizConectado = () => r?.connected === true || (r?.instance?.state ?? r?.state) === 'open';
  // Sem QR porque o provedor diz que já está conectado: confirma pela situação confiável.
  // Evolution 2.3.7 fica presa em "open" depois que o aparelho é removido; o logout destrava
  if (dizConectado()) {
    if (await conectadoNoProvedor(c)) return { conectado: true };
    if (c.provedor === 'evolution') {
      await desconectarWhatsApp(empresaId).catch(() => {});
      r = await pedirQr();
    }
  }
  const qr: string | undefined = c.provedor === 'zapi' ? r?.value : r?.base64;
  if (qr) return { conectado: false, qrcode: qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}` };
  throw new ErroProvedor(`WhatsApp: o provedor não devolveu o QR Code (${JSON.stringify(r).slice(0, 150)}).`);
}

/** Desconecta o número (logout): para enviar de novo, é preciso ler outro QR Code */
export async function desconectarWhatsApp(empresaId: string): Promise<void> {
  const c = await credenciais(empresaId);
  const { url, headers } = endereco(c, { zapi: 'disconnect', evolution: 'instance/logout' });
  await requisitar(url, { method: c.provedor === 'zapi' ? 'GET' : 'DELETE', headers });
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Um ciclo de envio das campanhas; devolve quantos disparos foram processados.
 * prazoMs: tempo máximo do ciclo (na Vercel a função tem limite); o que não couber fica
 * pendente para o próximo ciclo.
 */
export async function enviarPendentes(limite = 50, prazoMs = Infinity): Promise<number> {
  const fim = Date.now() + prazoMs;
  const conn = await pool.getConnection();
  try {
    // Trava no MySQL: dois servidores no mesmo banco não mandam a mesma mensagem duas vezes
    const [trava] = await conn.query<any[]>("SELECT GET_LOCK('crmweb_envio_whatsapp', 0) AS ok");
    if (!trava[0]?.ok) return 0;
    try {
      const colunas = Object.entries(VARIAVEIS).map(([k, sql]) => `${sql} AS ${k}`).join(', ');
      const [fila] = await conn.query<any[]>(
        `SELECT d.id, d.pessoa_id, c.empresa_id, m.assunto, m.corpo, p.telefone AS telefone_destino, ${colunas}
           FROM disparos_mensagens d
           JOIN campanha_mensagens m ON m.id = d.mensagem_id
           JOIN campanhas c ON c.id = m.campanha_id
           JOIN pessoas p ON p.id = d.pessoa_id
          WHERE d.situacao = 'pendente' AND d.agendado_para <= NOW()
            AND c.situacao = 'em_execucao' AND c.excluida_em IS NULL
            AND c.canal IN ('whatsapp', 'multicanal')
          ORDER BY d.agendado_para, d.id
          LIMIT ?`,
        [limite],
      );
      // Credenciais lidas uma vez por empresa no ciclo; empresa com provedor em falha sai do ciclo
      const creds = new Map<number, Credenciais>();
      const comFalha = new Set<number>();
      let processados = 0;
      for (const d of fila) {
        if (comFalha.has(d.empresa_id)) continue;
        try {
          if (!creds.has(d.empresa_id)) creds.set(d.empresa_id, await credenciais(d.empresa_id));
          const c = creds.get(d.empresa_id)!;
          if (Date.now() + c.intervalo * 1000 + 10_000 > fim) break; // pausa + envio não cabem mais no prazo
          if (processados) await esperar(c.intervalo * 1000);
          const assunto = personalizar(d.assunto, d).trim();
          const telefone = telefoneWhatsApp(d.telefone_destino);
          const texto = (assunto ? `*${assunto}*\n\n` : '') + personalizar(d.corpo, d);
          const resposta = await textoPara(c, telefone, texto);
          await conn.query(
            "UPDATE disparos_mensagens SET situacao = 'enviado', enviado_em = NOW(), mensagem_erro = NULL WHERE id = ? AND situacao = 'pendente'",
            [d.id],
          );
          await registrarEnviada(d.empresa_id, telefone, resposta, { tipo: 'texto', texto, pessoa_id: d.pessoa_id, disparo_id: d.id });
          processados++;
        } catch (err: any) {
          if (err instanceof ErroProvedor || /SESSION_SECRET/.test(err?.message)) {
            comFalha.add(d.empresa_id);
            console.error(`WhatsApp: empresa ${d.empresa_id}: ${err.message}`);
            continue;
          }
          await conn.query(
            "UPDATE disparos_mensagens SET situacao = 'falhou', mensagem_erro = ? WHERE id = ? AND situacao = 'pendente'",
            [String(err?.message || err).slice(0, 255), d.id],
          );
          processados++;
        }
      }
      return processados;
    } finally {
      await conn.query("SELECT RELEASE_LOCK('crmweb_envio_whatsapp')");
    }
  } finally {
    conn.release();
  }
}

/** Liga o envio automático das campanhas, a cada minuto (a configuração é lida por empresa) */
export function iniciarEnvioWhatsApp() {
  let rodando = false;
  const ciclo = async () => {
    if (rodando) return; // o ciclo anterior ainda está enviando
    rodando = true;
    try {
      const n = await enviarPendentes();
      if (n) console.log(`WhatsApp: ${n} disparo(s) processado(s).`);
    } catch (err: any) {
      console.error('WhatsApp: falha no ciclo de envio:', err.message);
    } finally {
      rodando = false;
    }
  };
  console.log('WhatsApp: envio automático das campanhas ligado (configuração por empresa, ou .env).');
  setInterval(ciclo, 60_000);
  ciclo();
}
