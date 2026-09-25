import { pool } from './db';
import { VARIAVEIS, personalizar } from './campanhas';
import { lerConfig } from './config';
import { cifrar, decifrar, textoConfig } from './segredo';

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
  return cfg;
}

/** Valor do banco → o que a tela recebe (sem os tokens) */
export function configWhatsPublica(cfg: ConfigWhats | null) {
  if (!cfg) return null;
  const { token_cifrado, client_token_cifrado, ...resto } = cfg;
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
async function enviar(c: Credenciais, zapi: { rota: string; corpo: unknown }, evolution: { rota: string; corpo: unknown }) {
  const { url, headers } = endereco(c, { zapi: zapi.rota, evolution: `message/${evolution.rota}` });
  await requisitar(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(c.provedor === 'zapi' ? zapi.corpo : evolution.corpo),
  });
}

const textoPara = (c: Credenciais, telefone: string, texto: string) =>
  enviar(c, { rota: 'send-text', corpo: { phone: telefone, message: texto } }, { rota: 'sendText', corpo: { number: telefone, text: texto } });

export async function enviarWhatsApp(empresaId: string | number, telefone: string, texto: string): Promise<void> {
  await textoPara(await credenciais(empresaId), telefone, texto);
}

/** Envia um PDF como documento, com legenda */
export async function enviarPdfWhatsApp(empresaId: string | number, telefone: string, pdf: Buffer, nomeArquivo: string, legenda: string): Promise<void> {
  const base64 = pdf.toString('base64');
  await enviar(
    await credenciais(empresaId),
    { rota: 'send-document/pdf', corpo: { phone: telefone, document: `data:application/pdf;base64,${base64}`, fileName: nomeArquivo, caption: legenda } },
    { rota: 'sendMedia', corpo: { number: telefone, mediatype: 'document', mimetype: 'application/pdf', media: base64, fileName: nomeArquivo, caption: legenda } },
  );
}

/** Consulta no provedor se o número está conectado; erro só quando o provedor falha (fora do ar, chave errada) */
export async function testarWhatsApp(empresaId: string): Promise<{ conectado: boolean; mensagem: string }> {
  const c = await credenciais(empresaId);
  const { url, headers } = endereco(c, { zapi: 'status', evolution: 'instance/connectionState' });
  const r: any = await (await requisitar(url, { headers })).json().catch(() => ({}));
  const conectado = c.provedor === 'zapi' ? r?.connected === true : (r?.instance?.state ?? r?.state) === 'open';
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
  const r: any = await (await requisitar(url, { headers })).json().catch(() => ({}));
  const qr: string | undefined = c.provedor === 'zapi' ? r?.value : r?.base64;
  if (qr) return { conectado: false, qrcode: qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}` };
  if (r?.connected === true || (r?.instance?.state ?? r?.state) === 'open') return { conectado: true };
  throw new ErroProvedor(`WhatsApp: o provedor não devolveu o QR Code (${JSON.stringify(r).slice(0, 150)}).`);
}

/** Desconecta o número (logout): para enviar de novo, é preciso ler outro QR Code */
export async function desconectarWhatsApp(empresaId: string): Promise<void> {
  const c = await credenciais(empresaId);
  const { url, headers } = endereco(c, { zapi: 'disconnect', evolution: 'instance/logout' });
  await requisitar(url, { method: c.provedor === 'zapi' ? 'GET' : 'DELETE', headers });
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Um ciclo de envio das campanhas; devolve quantos disparos foram processados */
export async function enviarPendentes(limite = 50): Promise<number> {
  const conn = await pool.getConnection();
  try {
    // Trava no MySQL: dois servidores no mesmo banco não mandam a mesma mensagem duas vezes
    const [trava] = await conn.query<any[]>("SELECT GET_LOCK('crmweb_envio_whatsapp', 0) AS ok");
    if (!trava[0]?.ok) return 0;
    try {
      const colunas = Object.entries(VARIAVEIS).map(([k, sql]) => `${sql} AS ${k}`).join(', ');
      const [fila] = await conn.query<any[]>(
        `SELECT d.id, c.empresa_id, m.assunto, m.corpo, p.telefone AS telefone_destino, ${colunas}
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
          if (processados) await esperar(c.intervalo * 1000);
          const assunto = personalizar(d.assunto, d).trim();
          await textoPara(c, telefoneWhatsApp(d.telefone_destino), (assunto ? `*${assunto}*\n\n` : '') + personalizar(d.corpo, d));
          await conn.query(
            "UPDATE disparos_mensagens SET situacao = 'enviado', enviado_em = NOW(), mensagem_erro = NULL WHERE id = ? AND situacao = 'pendente'",
            [d.id],
          );
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
