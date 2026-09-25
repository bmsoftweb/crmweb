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

/** Identifica a instância no provedor: Evolution = servidor + nome; Z-API = ID (sem diferenciar maiúsculas) */
const idInstancia = (c: { provedor: string; url?: string; instancia: string }) =>
  [c.provedor, (c.url ?? '').trim().replace(/\/+$/, '').toLowerCase(), c.instancia.trim().toLowerCase()].join('|');

/**
 * Uma instância é de uma empresa só: recebe um endereço de aviso só (as mensagens iriam para uma
 * empresa apenas) e as duas enviariam pelo mesmo número. O erro não diz de quem ela é.
 */
export async function conferirInstanciaUnica(empresaId: string, cfg: ConfigWhats | null) {
  if (!cfg?.provedor) return;
  const [rows] = await pool.query<any[]>(
    "SELECT valor FROM config WHERE grupo = 'whatsapp' AND chave = 'provedor' AND empresa_id <> ?",
    [empresaId],
  );
  const minha = idInstancia(cfg);
  for (const r of rows) {
    let outra: ConfigWhats | null = null;
    try {
      outra = JSON.parse(r.valor);
    } catch {
      continue;
    }
    if (outra?.provedor && idInstancia(outra) === minha) {
      throw new Error(`WhatsApp: nome da instância "${cfg.instancia}" inválido.`);
    }
  }
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
  contato_id?: number | null;
  usuario_id?: number | null;
  disparo_id?: number | null;
}

/** Envia texto; devolve o número da conversa (como o WhatsApp o conhece: às vezes sem o 9) */
export async function enviarWhatsApp(empresaId: string | number, telefone: string, texto: string, reg: Registro = {}): Promise<string> {
  const resposta = await textoPara(await credenciais(empresaId), telefone, texto);
  return registrarEnviada(empresaId, telefone, resposta, { ...reg, tipo: 'texto', texto });
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

/** Arquivo enviado pela tela de conversas (base64 sem o prefixo data:) */
export interface ArquivoEnvio {
  tipo: 'imagem' | 'video' | 'audio' | 'documento';
  base64: string;
  mimetype: string;
  nome: string;
  legenda: string | null;
}

/**
 * Envia imagem, vídeo, documento ou áudio. Áudio vai como mensagem de voz (a Evolution converte
 * para o formato do WhatsApp); devolve o número da conversa, como enviarWhatsApp.
 */
export async function enviarMidiaWhatsApp(empresaId: string | number, telefone: string, a: ArquivoEnvio, reg: Registro = {}): Promise<string> {
  const resposta = await midiaPara(await credenciais(empresaId), telefone, a);
  return registrarEnviada(empresaId, telefone, resposta, {
    ...reg,
    tipo: a.tipo,
    texto: a.legenda,
    arquivo_nome: a.tipo === 'documento' ? a.nome : undefined,
  });
}

/** Envio do arquivo no formato de cada provedor; devolve a resposta do provedor */
async function midiaPara(c: Credenciais, telefone: string, a: ArquivoEnvio): Promise<any> {
  const dataUrl = `data:${a.mimetype};base64,${a.base64}`;
  const legenda = a.legenda || undefined;
  let resposta: any;
  if (a.tipo === 'audio') {
    resposta = await enviar(c, { rota: 'send-audio', corpo: { phone: telefone, audio: dataUrl } }, { rota: 'sendWhatsAppAudio', corpo: { number: telefone, audio: a.base64 } });
  } else {
    const extensao = a.nome.includes('.') ? a.nome.split('.').pop() : 'bin';
    const zapi = {
      imagem: { rota: 'send-image', corpo: { phone: telefone, image: dataUrl, caption: legenda } },
      video: { rota: 'send-video', corpo: { phone: telefone, video: dataUrl, caption: legenda } },
      documento: { rota: `send-document/${extensao}`, corpo: { phone: telefone, document: dataUrl, fileName: a.nome, caption: legenda } },
    }[a.tipo];
    const mediatype = { imagem: 'image', video: 'video', documento: 'document' }[a.tipo];
    resposta = await enviar(c, zapi, { rota: 'sendMedia', corpo: { number: telefone, mediatype, mimetype: a.mimetype, media: a.base64, fileName: a.nome, caption: legenda } });
  }
  return resposta;
}

/** Pausa entre mensagens da empresa, em segundos (Configurações › WhatsApp) */
export async function intervaloWhatsApp(empresaId: string | number): Promise<number> {
  return (await credenciais(empresaId)).intervalo;
}

/**
 * Mensagem automática (server/automaticas.ts). A origem (evento:registro:momento) é única na
 * empresa e fica reservada ANTES do envio: o mesmo aviso nunca sai duas vezes, nem com dois
 * servidores. Provedor em falha desfaz a reserva (tenta no próximo ciclo) e lança ErroProvedor;
 * destinatário recusado fica como "falhou", com o motivo. Devolve false se já tinha saído.
 */
export async function enviarAutomatica(empresaId: string | number, origem: string, pessoaId: number | null, telefone: string, texto: string): Promise<boolean> {
  const id = await reservarEnvio(empresaId, origem, { pessoa_id: pessoaId, contato_id: null }, telefone, texto);
  if (!id) return false;
  await enviarReservada(empresaId, id, origem, telefone, texto);
  return true;
}

/** Reserva a origem (única na empresa) antes de enviar; null se ela já existia (já saiu ou está saindo) */
export async function reservarEnvio(empresaId: string | number, origem: string, dono: Dono, telefone: string, texto: string): Promise<number | null> {
  const [r] = await pool.query<any>(
    `INSERT IGNORE INTO whatsapp_mensagens (empresa_id, pessoa_id, contato_id, telefone, direcao, tipo, texto, situacao, origem, vista, data_hora)
     VALUES (?, ?, ?, ?, 'enviada', 'texto', ?, 'pendente', ?, 1, NOW())`,
    [empresaId, dono.pessoa_id, dono.contato_id, telefone, texto, origem],
  );
  return r.affectedRows ? r.insertId : null;
}

/**
 * Envia a mensagem reservada (texto final). Provedor em falha desfaz a reserva (tenta de novo depois)
 * e lança ErroProvedor; destinatário recusado fica como "falhou", com o motivo.
 */
export async function enviarReservada(empresaId: string | number, id: number, origem: string, telefone: string, texto: string, midia?: ArquivoEnvio): Promise<void> {
  let resposta: any;
  try {
    const c = await credenciais(empresaId);
    resposta = midia ? await midiaPara(c, telefone, midia) : await textoPara(c, telefone, texto);
    if (midia) await pool.query('UPDATE whatsapp_mensagens SET tipo = ? WHERE id = ?', [midia.tipo, id]);
  } catch (err: any) {
    if (err instanceof ErroProvedor) {
      await pool.query('DELETE FROM whatsapp_mensagens WHERE id = ?', [id]);
      throw err;
    }
    await pool.query("UPDATE whatsapp_mensagens SET texto = ?, situacao = 'falhou', erro = ? WHERE id = ?", [texto, String(err?.message || err).slice(0, 255), id]);
    return;
  }
  // Já saiu: daqui em diante, falha só vai para o log (nunca pode liberar um novo envio)
  try {
    const waId: string | null = resposta?.key?.id ?? resposta?.messageId ?? null;
    const jid = resposta?.key?.remoteJid;
    const numero = typeof jid === 'string' && jid.endsWith('@s.whatsapp.net') ? digitosDoJid(jid) : telefone;
    // O aviso do webhook pode ter gravado a mesma mensagem antes: fica a reserva, que tem a origem
    if (waId) await pool.query('DELETE FROM whatsapp_mensagens WHERE empresa_id = ? AND wa_id = ? AND id <> ?', [empresaId, waId, id]);
    await pool.query("UPDATE whatsapp_mensagens SET texto = ?, wa_id = ?, telefone = ?, situacao = 'enviada' WHERE id = ?", [texto, waId, numero, id]);
  } catch (err: any) {
    console.error(`WhatsApp: mensagem automática ${origem} enviada, mas não registrada: ${err.message}`);
  }
}

/** Mostra "digitando..." para o cliente por alguns segundos (só Evolution; falha é ignorada) */
export async function mostrarDigitando(empresaId: string | number, telefone: string, ms: number): Promise<void> {
  try {
    const c = await credenciais(empresaId);
    if (c.provedor !== 'evolution') return;
    await fetch(`${c.url}/chat/sendPresence/${encodeURIComponent(c.instancia)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.token },
      body: JSON.stringify({ number: telefone, presence: 'composing', delay: ms }),
      signal: AbortSignal.timeout(ms + 10_000),
    });
  } catch {
    // é só um enfeite: sem ele, a resposta sai do mesmo jeito
  }
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

/** De quem é o número: a pessoa e, quando for de um contato dela, o contato */
export interface Dono {
  pessoa_id: number | null;
  contato_id: number | null;
}

/**
 * Onde procurar o número, na ordem de preferência: o WhatsApp da pessoa, o WhatsApp e o celular
 * dos contatos (ativos), e por último os telefones (fixos, em geral)
 */
const CAMPOS_DONO: { de: 'p' | 'c'; campo: 'whatsapp' | 'celular' | 'telefone' }[] = [
  { de: 'p', campo: 'whatsapp' },
  { de: 'c', campo: 'whatsapp' },
  { de: 'c', campo: 'celular' },
  { de: 'p', campo: 'telefone' },
  { de: 'c', campo: 'telefone' },
];

/** Escolhe o dono entre os cadastros candidatos (ordenados por id), pela ordem de CAMPOS_DONO */
export function escolherDono(chave: string, candidatos: { de: 'p' | 'c'; pessoa_id: number; contato_id: number | null; whatsapp?: string | null; celular?: string | null; telefone?: string | null }[]): Dono {
  const dono = (c: (typeof candidatos)[number]): Dono => ({ pessoa_id: c.pessoa_id, contato_id: c.de === 'c' ? c.contato_id : null });
  for (const { de, campo } of CAMPOS_DONO) {
    const achado = candidatos.find((c) => c.de === de && chaveTelefone(c[campo]) === chave);
    if (achado) return dono(achado);
  }
  // Metade dos cadastros importados não tem DDD: sem um com DDD igual, vale o que bate nos 8 dígitos.
  // ponytail: pode ligar à pessoa errada de outro DDD com o mesmo número; cadastrar o DDD resolve
  if (chave.startsWith('+')) return { pessoa_id: null, contato_id: null };
  const semDdd = (t: string | null | undefined) => /^\d{8,9}$/.test(String(t ?? '').replace(/\D/g, '').replace(/^0+/, ''));
  for (const { de, campo } of CAMPOS_DONO) {
    const achado = candidatos.find((c) => c.de === de && semDdd(c[campo]));
    if (achado) return dono(achado);
  }
  return { pessoa_id: null, contato_id: null };
}

/** De quem é o número (DDI + DDD + número): pessoa e, se for o caso, o contato dela */
export async function donoDoTelefone(empresaId: string | number, telefone: string): Promise<Dono> {
  const chave = chaveTelefone(telefone, true);
  if (!chave) return { pessoa_id: null, contato_id: null };
  const oito = (c: string) => `RIGHT(REGEXP_REPLACE(${c}, '[^0-9]', ''), 8) = ?`;
  const fim = chave.slice(-8);
  const [rows] = await pool.query<any[]>(
    `SELECT 'p' AS de, id AS pessoa_id, NULL AS contato_id, whatsapp, NULL AS celular, telefone
       FROM pessoas WHERE empresa_id = ? AND (${oito('whatsapp')} OR ${oito('telefone')})
     UNION ALL
     SELECT 'c', pessoa_id, id, whatsapp, celular, telefone
       FROM pessoas_contatos WHERE empresa_id = ? AND ativo = 1 AND (${oito('whatsapp')} OR ${oito('celular')} OR ${oito('telefone')})
     ORDER BY pessoa_id, contato_id`,
    [empresaId, fim, fim, empresaId, fim, fim, fim],
  );
  return escolherDono(chave, rows);
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
 * Falha aqui não desfaz o envio: só fica no log. Devolve o número da conversa.
 */
async function registrarEnviada(
  empresaId: string | number,
  telefone: string,
  resposta: any,
  m: Registro & { tipo: string; texto: string | null; arquivo_nome?: string },
): Promise<string> {
  const jid = resposta?.key?.remoteJid;
  const numero = typeof jid === 'string' && jid.endsWith('@s.whatsapp.net') ? digitosDoJid(jid) : telefone;
  try {
    const waId: string | null = resposta?.key?.id ?? resposta?.messageId ?? null;
    // Sem a pessoa (resposta pela conversa, proposta), procura pelo número; com ela, o contato vem junto se o número for dele
    const dono = m.pessoa_id ? { pessoa_id: m.pessoa_id, contato_id: m.contato_id ?? null } : await donoDoTelefone(empresaId, numero);
    await pool.query(
      `INSERT INTO whatsapp_mensagens
         (empresa_id, pessoa_id, contato_id, telefone, direcao, tipo, texto, arquivo_nome, wa_id, situacao, disparo_id, usuario_id, vista, data_hora)
       VALUES (?, ?, ?, ?, 'enviada', ?, ?, ?, ?, 'enviada', ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE pessoa_id = COALESCE(pessoa_id, VALUES(pessoa_id)), contato_id = COALESCE(contato_id, VALUES(contato_id)),
         disparo_id = COALESCE(disparo_id, VALUES(disparo_id)), usuario_id = COALESCE(usuario_id, VALUES(usuario_id)),
         arquivo_nome = COALESCE(arquivo_nome, VALUES(arquivo_nome))`,
      [empresaId, dono.pessoa_id, dono.contato_id, numero, m.tipo, m.texto, m.arquivo_nome ?? null, waId, m.disparo_id ?? null, m.usuario_id ?? null],
    );
    // O aviso de entrega pode ter chegado antes deste registro
    if (waId && m.disparo_id) await repassarAoDisparo(empresaId, waId);
  } catch (err: any) {
    console.error(`WhatsApp: mensagem enviada para ${telefone} não registrada: ${err.message}`);
  }
  return numero;
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
  // Mensagens de empresas (botões, lista, modelo, interativa, enquete) e as respostas a elas: vale o texto
  const interativa =
    txt(m.buttonsMessage?.contentText) ??
    txt(m.listMessage?.description ?? m.listMessage?.title) ??
    txt(m.templateMessage?.hydratedTemplate?.hydratedContentText ?? m.templateMessage?.hydratedFourRowTemplate?.hydratedContentText) ??
    txt(m.interactiveMessage?.body?.text) ??
    txt(m.buttonsResponseMessage?.selectedDisplayText) ??
    txt(m.listResponseMessage?.title) ??
    txt(m.templateButtonReplyMessage?.selectedDisplayText) ??
    txt(m.interactiveResponseMessage?.body?.text);
  if (interativa) return { tipo: 'texto', texto: interativa, arquivo: null };
  const enquete = m.pollCreationMessage ?? m.pollCreationMessageV2 ?? m.pollCreationMessageV3;
  if (enquete) {
    const opcoes = (enquete.options ?? []).map((o: any) => o?.optionName).filter(Boolean);
    return { tipo: 'texto', texto: [txt(enquete.name) ?? 'Enquete', ...opcoes.map((o: string) => `• ${o}`)].join('\n'), arquivo: null };
  }
  // Reação, apagar, edição, chaves de criptografia: não são mensagens da conversa
  const ignorar = ['reactionMessage', 'protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo', 'editedMessage', 'pollUpdateMessage'];
  const outras = Object.keys(m).filter((k) => !ignorar.includes(k));
  if (!outras.length) return null;
  console.warn(`WhatsApp: mensagem de formato não reconhecido (${outras.join(', ')}).`);
  return { tipo: 'outro', texto: null, arquivo: null };
}

/** Mensagem recebida nova (o chatbot decide se responde) */
export interface MensagemNova {
  empresaId: number;
  telefone: string;
  id: number;
}

/** Aviso de mensagem nova (recebida, ou enviada pelo celular/pelo CRM). Devolve a recebida nova, se for o caso */
async function gravarMensagem(empresaId: number, d: any): Promise<MensagemNova | null> {
  const key = d?.key ?? {};
  // Com o endereçamento novo (LID), o número vem no remoteJidAlt/senderPn
  const jid = [key.remoteJid, key.remoteJidAlt, key.senderPn].find((j) => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));
  if (!jid || !key.id) return null; // grupo, status, canal
  const c = conteudoMensagem(d.message);
  if (!c) return null;
  const telefone = digitosDoJid(jid);
  const recebida = !key.fromMe;
  const dono = await donoDoTelefone(empresaId, telefone);
  const ts = Number(d.messageTimestamp) || null;
  // Nome do perfil no WhatsApp de quem mandou: identifica quem ainda não está em Pessoas
  const nomeContato = recebida && typeof d.pushName === 'string' && d.pushName.trim() ? d.pushName.trim().slice(0, 150) : null;
  const [r] = await pool.query<any>(
    `INSERT INTO whatsapp_mensagens (empresa_id, pessoa_id, contato_id, telefone, nome_contato, direcao, tipo, texto, arquivo_nome, wa_id, situacao, vista, data_hora)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(FROM_UNIXTIME(?), NOW()))
     ON DUPLICATE KEY UPDATE pessoa_id = COALESCE(pessoa_id, VALUES(pessoa_id)), contato_id = COALESCE(contato_id, VALUES(contato_id))`,
    [empresaId, dono.pessoa_id, dono.contato_id, telefone, nomeContato, recebida ? 'recebida' : 'enviada', c.tipo, c.texto, c.arquivo, key.id, recebida ? 'recebida' : 'enviada', recebida ? 0 : 1, ts],
  );
  // affectedRows 1 = linha nova (2/0 = aviso repetido de uma que já estava gravada)
  return recebida && r.affectedRows === 1 ? { empresaId, telefone, id: r.insertId } : null;
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
export async function receberAvisoEvolution(token: string, corpo: any): Promise<MensagemNova[]> {
  const dono = await empresaDoToken(token);
  if (!dono) throw Object.assign(new Error('Endereço de recebimento desconhecido.'), { status: 404 });
  if (corpo?.instance && corpo.instance !== dono.cfg.instancia) return [];
  const evento = String(corpo?.event ?? '').toLowerCase().replace(/_/g, '.');
  const itens = Array.isArray(corpo?.data) ? corpo.data : [corpo?.data];
  const novas: MensagemNova[] = [];
  for (const d of itens) {
    if (evento === 'messages.upsert' || evento === 'send.message') {
      const nova = await gravarMensagem(dono.empresaId, d);
      if (nova) novas.push(nova);
    } else if (evento === 'messages.update') await atualizarSituacao(dono.empresaId, d);
  }
  return novas;
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
async function conectadoNoProvedor(c: Credenciais): Promise<{ conectado: boolean; numero?: string }> {
  if (c.provedor === 'zapi') {
    const { url, headers } = endereco(c, { zapi: 'status', evolution: '' });
    const r: any = await (await requisitar(url, { headers })).json().catch(() => ({}));
    return { conectado: r?.connected === true };
  }
  const url = `${c.url}/instance/fetchInstances?instanceName=${encodeURIComponent(c.instancia)}`;
  const r: any = await (await requisitar(url, { headers: { apikey: c.token } })).json().catch(() => null);
  const inst = Array.isArray(r) ? r.find((i: any) => (i?.name ?? i?.instance?.instanceName) === c.instancia) : null;
  if (!inst) throw new ErroProvedor(`WhatsApp: instância "${c.instancia}" não encontrada na Evolution.`);
  const conectado = (inst.connectionStatus ?? inst.instance?.status) === 'open';
  // ownerJid: "5547999999999@s.whatsapp.net" (número do aparelho conectado)
  const numero = String(inst.ownerJid ?? inst.instance?.owner ?? '').split('@')[0].split(':')[0];
  return { conectado, numero: conectado && numero ? numero : undefined };
}

/** Consulta no provedor se o número está conectado; erro só quando o provedor falha (fora do ar, chave errada) */
export async function testarWhatsApp(empresaId: string): Promise<{ conectado: boolean; numero?: string; mensagem: string }> {
  const c = await credenciais(empresaId);
  const { conectado, numero } = await conectadoNoProvedor(c);
  const nome = c.provedor === 'zapi' ? 'Z-API' : 'Evolution';
  return { conectado, numero, mensagem: conectado ? `${nome}: número conectado.` : `${nome}: o provedor respondeu, mas o número está desconectado. Use Conectar WhatsApp.` };
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
    if ((await conectadoNoProvedor(c)).conectado) return { conectado: true };
    if (c.provedor === 'evolution') {
      await desconectarWhatsApp(empresaId).catch(() => {});
      r = await pedirQr();
    }
  }
  const qr: string | undefined = c.provedor === 'zapi' ? r?.value : r?.base64;
  if (qr) return { conectado: false, qrcode: qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}` };
  throw new ErroProvedor(`WhatsApp: o provedor não devolveu o QR Code (${JSON.stringify(r).slice(0, 150)}).`);
}

/**
 * Arquivo de uma mensagem (imagem, figurinha, áudio, vídeo) pelo id no WhatsApp. Evolution: baixa e decifra
 * pelo chat/getBase64FromMediaMessage; o CRM não guarda o arquivo.
 */
export async function midiaDaMensagem(empresaId: string | number, waId: string): Promise<{ mimetype: string; dados: Buffer }> {
  const c = await credenciais(empresaId);
  if (c.provedor !== 'evolution') throw new Error('Imagens das mensagens só pela Evolution.');
  const { url, headers } = endereco(c, { zapi: '', evolution: 'chat/getBase64FromMediaMessage' });
  const r: any = await (
    await requisitar(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ message: { key: { id: waId } }, convertToMp4: false }) })
  ).json();
  if (!r?.base64) throw new Error('Arquivo da mensagem não encontrado no WhatsApp.');
  return { mimetype: String(r.mimetype || 'application/octet-stream').split(';')[0], dados: Buffer.from(r.base64, 'base64') };
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
        `SELECT d.id, d.pessoa_id, c.empresa_id, m.assunto, m.corpo, COALESCE(NULLIF(p.whatsapp, ''), p.telefone) AS telefone_destino, ${colunas}
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
