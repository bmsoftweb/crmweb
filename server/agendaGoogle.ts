import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { cifrar, decifrar } from './segredo.js';
import { lerConfig, somenteAdmin } from './config.js';
import { antesDeExcluir, aposGravar } from './regras.js';
import { assuntoComIcone, ICONE_DO_TIPO } from './schema.js';

/**
 * Google Agenda da empresa ↔ atividades do CRM.
 *
 * O administrador conecta uma conta Google (OAuth, app do .env: GOOGLE_CLIENT_ID/SECRET). A cada minuto, na agenda
 * principal dessa conta:
 * - Google → CRM, todos os eventos (sincronização incremental, syncToken): evento novo (de hoje em diante) vira
 *   atividade; alterado atualiza assunto, data, hora, duração e observação; excluído exclui a atividade.
 * - CRM → Google, só os tipos de TIPOS_NA_AGENDA: atividades com atualizado_em depois do cursor (qualquer caminho de
 *   gravação serve). Evento novo ganha a marca crm_atividade; no existente, só os campos que mudaram (a descrição
 *   formatada no Google não é regravada à toa). Concluída fica cinza. Excluída no cadastro sai da agenda; de hora em
 *   hora, saem os eventos marcados cuja atividade sumiu por outro caminho (exclusão do negócio).
 * O vínculo é atividades.google_event_id (eventos recorrentes vêm expandidos: uma atividade por ocorrência).
 * Estado em config (agenda.google), fora da tela genérica de configurações: token cifrado e cursores.
 */

const GRUPO = 'agenda';
const CHAVE = 'google';
/** Eventos (ler e gravar) + lista de agendas da conta (só leitura) */
const ESCOPO = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const eventosDe = (agenda: string) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(agenda)}/events`;

/**
 * Vínculo gravado em atividades.google_event_id: "<id da agenda>/<id do evento>" (o mesmo id de evento pode existir
 * em agendas diferentes). Sem a barra, é da agenda principal.
 */
export const chaveEvento = (agenda: string, evento: string) => `${agenda}/${evento}`;
export function separarChave(chave: string): { agenda: string; evento: string } {
  const i = chave.lastIndexOf('/');
  return i < 0 ? { agenda: 'primary', evento: chave } : { agenda: chave.slice(0, i), evento: chave.slice(i + 1) };
}
const TZ = 'America/Sao_Paulo';
/** Ocorrências de eventos recorrentes além disso não viram atividade (a série sem fim geraria milhares) */
const DIAS_A_FRENTE = 365;
/** Tipos de atividade que o CRM leva para o Google (do Google, vêm todos os eventos) */
export const TIPOS_NA_AGENDA = ['visita', 'reuniao', 'reuniao_externa', 'reuniao_virtual'];

interface Estado {
  refresh_token: string; // cifrado
  conta: string;
  conectado_em: string;
  /** Agendas da conta em que ela pode gravar (lidas de hora em hora); feriados e aniversários ficam de fora */
  agendas?: { id: string; nome: string; principal?: boolean }[];
  agendas_em?: number;
  /** A conta foi conectada antes da permissão de listar as agendas: só a principal é lida até reconectar */
  reconectar?: boolean;
  /** Agenda que recebe as visitas e reuniões do CRM (sem ela: a principal) */
  destino?: string | null;
  /** Por agenda: syncToken da sincronização incremental e a página em andamento */
  sync?: Record<string, { token?: string | null; pagina?: string | null }>;
  /** Última atividade enviada ao Google (atualizado_em + id) */
  cursor?: { em: string; id: number } | null;
  limpeza_em?: number;
  ultima_sinc?: string;
  erro?: string | null;
}

const clientId = () => process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';
const redirectUri = (origem: string) => `${origem.replace(/\/+$/, '')}/api/agenda/google/retorno`;

async function gravarEstado(empresaId: string, valor: Estado | null) {
  const texto = JSON.stringify(valor);
  const [r] = await pool.query<any>('UPDATE config SET valor = ? WHERE empresa_id = ? AND grupo = ? AND chave = ?', [texto, empresaId, GRUPO, CHAVE]);
  if (!r.affectedRows) await pool.query('INSERT INTO config (empresa_id, grupo, chave, valor) VALUES (?, ?, ?, ?)', [empresaId, GRUPO, CHAVE, texto]);
}

// ---------------------------------------------------------------- OAuth

async function token(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Google: ${j.error_description || j.error || r.status}`), { codigo: j.error });
  return j as { access_token: string; expires_in: number; refresh_token?: string };
}

/** Access token por empresa, guardado enquanto vale (na Vercel, só durante a função) */
const acessos = new Map<string, { token: string; ate: number }>();
async function acesso(empresaId: string, e: Estado): Promise<string> {
  const c = acessos.get(empresaId);
  if (c && c.ate > Date.now()) return c.token;
  const t = await token({ grant_type: 'refresh_token', refresh_token: decifrar(e.refresh_token, 'Configurações › Google Agenda') });
  acessos.set(empresaId, { token: t.access_token, ate: Date.now() + (t.expires_in - 60) * 1000 });
  return t.access_token;
}

/** Chamada à API do Google Agenda; 404/410 (evento sumido, syncToken vencido) voltam para quem chamou decidir */
async function google(empresaId: string, e: Estado, metodo: string, url: string, corpo?: unknown): Promise<{ status: number; dados: any }> {
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${await acesso(empresaId, e)}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados: any = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok && ![404, 410].includes(r.status))
    throw Object.assign(new Error(`Google Agenda ${r.status}: ${dados?.error?.message || r.statusText}`), { status: r.status });
  return { status: r.status, dados };
}

/** Agendas da conta em que ela pode gravar. Conexão antiga, sem a permissão de listar: só a principal */
async function carregarAgendas(empresaId: string, e: Estado) {
  try {
    const q = new URLSearchParams({ minAccessRole: 'writer', fields: 'items(id,summary,summaryOverride,primary)' });
    const r = await google(empresaId, e, 'GET', `https://www.googleapis.com/calendar/v3/users/me/calendarList?${q}`);
    e.agendas = (r.dados?.items || []).map((x: any) => ({ id: x.id, nome: x.summaryOverride || x.summary || x.id, ...(x.primary ? { principal: true } : {}) }));
    e.reconectar = false;
  } catch (err: any) {
    if (err.status !== 403) throw err;
    e.agendas = [{ id: 'primary', nome: e.conta || 'Agenda principal', principal: true }];
    e.reconectar = true;
  }
  e.agendas_em = Date.now();
}

/** Agenda que recebe o que o CRM cria: a escolhida, se ainda estiver na conta; senão a principal */
const agendaDestino = (e: Estado) =>
  (e.destino && e.agendas?.some((a) => a.id === e.destino) ? e.destino : e.agendas?.find((a) => a.principal)?.id) || 'primary';

// ---------------------------------------------------------------- Conversões (horário de Brasília, sem horário de verão)

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const minutos = (t: string | null | undefined) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hhmm = (min: number) => `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;

/** Instante do Google (com fuso) para data e hora de Brasília (UTC-3) */
export function emBrasilia(iso: string) {
  const x = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return {
    data: `${x.getUTCFullYear()}-${doisDigitos(x.getUTCMonth() + 1)}-${doisDigitos(x.getUTCDate())}`,
    hora: `${doisDigitos(x.getUTCHours())}:${doisDigitos(x.getUTCMinutes())}`,
  };
}

/** A descrição do Google vem em HTML simples (quebras, links, negrito): vira texto */
export function textoDaDescricao(html: string | undefined): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Campos da atividade tirados do evento */
export function camposDoEvento(ev: any): Record<string, any> {
  const c: Record<string, any> = { assunto: String(ev.summary || '').trim().slice(0, 255) || '(sem título)', observacao: textoDaDescricao(ev.description) || null };
  if (ev.start?.dateTime) {
    const i = emBrasilia(ev.start.dateTime);
    c.data_vencimento = i.data;
    c.hora_vencimento = `${i.hora}:00`;
    if (ev.end?.dateTime) c.duracao = `${hhmm(Math.max(Math.round((new Date(ev.end.dateTime).getTime() - new Date(ev.start.dateTime).getTime()) / 60_000), 0))}:00`;
  } else if (ev.start?.date) {
    c.data_vencimento = ev.start.date;
    c.hora_vencimento = null;
  }
  return c;
}

/**
 * Tipo da atividade criada a partir de um evento:
 * - o título começa com o ícone de um tipo de reunião (🚗 🏠 💻): esse tipo;
 * - fala em reunião (título ou descrição): com videochamada (Meet) ou "virtual"/"online" = Reunião Virtual; na BM
 *   ("na BM", "na BMsoft", "BM Soft"...) = Reunião Interna; senão Reunião Externa;
 * - o resto = Tarefa
 */
export function tipoDoEvento(ev: any): 'reuniao' | 'reuniao_externa' | 'reuniao_virtual' | 'tarefa' {
  const titulo = String(ev.summary ?? '').trimStart();
  for (const [tipo, icone] of Object.entries(ICONE_DO_TIPO)) if (titulo.startsWith(icone)) return tipo as any;
  const texto = `${titulo} ${textoDaDescricao(ev.description)}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!/reuni(ao|oes)/.test(texto)) return 'tarefa';
  if (ev.hangoutLink || ev.conferenceData || /(^|[^a-z])(virtual|online)([^a-z]|$)/.test(texto)) return 'reuniao_virtual';
  return /(^|[^a-z0-9])bm/.test(texto) ? 'reuniao' : 'reuniao_externa';
}

/** Campos do evento que divergem da atividade (hora e duração comparadas em HH:MM) */
export function diferencas(a: Record<string, any>, novo: Record<string, any>): string[] {
  const igual = (c: string) =>
    c === 'hora_vencimento' || c === 'duracao'
      ? (a[c] ? hhmm(minutos(a[c])) : null) === (novo[c] ? hhmm(minutos(novo[c])) : null)
      : String(a[c] ?? '') === String(novo[c] ?? '');
  return Object.keys(novo).filter((c) => !igual(c));
}

/** Data/hora de parede somando minutos (UTC só como calculadora, sem fuso) */
function somar(data: string, hora: string, mais: number) {
  const [a, m, d] = data.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d) + (minutos(hora) + mais) * 60_000);
  return `${x.getUTCFullYear()}-${doisDigitos(x.getUTCMonth() + 1)}-${doisDigitos(x.getUTCDate())}T${doisDigitos(x.getUTCHours())}:${doisDigitos(x.getUTCMinutes())}:00`;
}

/** Início e fim do evento a partir da atividade (sem hora: dia inteiro) */
export function periodoDa(a: any) {
  if (!a.hora_vencimento) return { start: { date: a.data_vencimento }, end: { date: somar(a.data_vencimento, '00:00', 24 * 60).slice(0, 10) } };
  const duracao = Math.max(minutos(a.duracao) || 15, 1);
  return {
    start: { dateTime: somar(a.data_vencimento, a.hora_vencimento, 0), timeZone: TZ },
    end: { dateTime: somar(a.data_vencimento, a.hora_vencimento, duracao), timeZone: TZ },
  };
}

// ---------------------------------------------------------------- Google → CRM

async function receber(empresaId: string, e: Estado, ate: number): Promise<number> {
  let n = 0;
  const [[{ hoje, limite }]] = await pool.query<any[]>(
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoje, DATE_FORMAT(CURDATE() + INTERVAL ${DIAS_A_FRENTE} DAY, '%Y-%m-%d') AS limite`,
  );
  e.sync ||= {};
  for (const agenda of e.agendas || []) {
    const s = (e.sync[agenda.id] ||= {});
    while (Date.now() < ate) {
      // Sem syncToken (primeira vez ou vencido): lista a agenda inteira; os eventos antigos não viram atividade
      const q = new URLSearchParams({ maxResults: '250', showDeleted: 'true', singleEvents: 'true' });
      if (s.pagina) q.set('pageToken', s.pagina);
      else if (s.token) q.set('syncToken', s.token);
      const r = await google(empresaId, e, 'GET', `${eventosDe(agenda.id)}?${q}`);
      if (r.status === 410) {
        // syncToken vencido: recomeça do zero
        Object.assign(s, { token: null, pagina: null });
        continue;
      }
      if (r.status === 404) break; // agenda apagada ou descompartilhada: some da lista na próxima leitura
      const inicial = !s.token;
      for (const ev of r.dados.items || []) {
        // Primeira leitura de uma agenda: o passado não vira atividade nem tem vínculo a atualizar, e consultar o
        // banco evento a evento deixaria agendas com anos de histórico levando vários minutos
        const dia = String(ev.start?.date || ev.start?.dateTime || '').slice(0, 10);
        if (inicial && dia && dia < hoje) continue;
        try {
          n += await aplicarEvento(empresaId, agenda.id, ev, hoje, limite);
        } catch (err: any) {
          console.error(`Google Agenda: evento ${ev.id} não aplicado: ${err.message}`);
        }
      }
      s.pagina = r.dados.nextPageToken || null;
      if (r.dados.nextSyncToken) {
        s.token = r.dados.nextSyncToken;
        break;
      }
    }
  }
  return n;
}

async function aplicarEvento(empresaId: string, agenda: string, ev: any, hoje: string, limite: string): Promise<number> {
  const chave = chaveEvento(agenda, ev.id);
  const campos = 'SELECT id, tipo, assunto, data_vencimento, hora_vencimento, duracao, observacao FROM atividades';
  let [[a]] = await pool.query<any[]>(`${campos} WHERE empresa_id = ? AND google_event_id = ? LIMIT 1`, [empresaId, chave]);
  // Evento criado pelo CRM cujo vínculo não chegou a ser gravado: liga pela marca em vez de duplicar
  const marca = ev.extendedProperties?.private;
  // (evento excluído não religa: a atividade pode ter sido desligada da agenda de propósito)
  if (!a && ev.status !== 'cancelled' && marca?.crm_empresa === empresaId && marca.crm_atividade) {
    const [r] = await pool.query<any>('UPDATE atividades SET google_event_id = ?, atualizado_em = atualizado_em WHERE id = ? AND empresa_id = ? AND google_event_id IS NULL', [
      chave,
      marca.crm_atividade,
      empresaId,
    ]);
    if (r.affectedRows) [[a]] = await pool.query<any[]>(`${campos} WHERE id = ?`, [marca.crm_atividade]);
  }

  if (ev.status === 'cancelled') {
    if (!a) return 0;
    // Mesmo caminho da exclusão no cadastro: o negócio recalcula o próximo follow-up
    const negocios = await antesDeExcluir('atividades', String(a.id));
    await pool.query('DELETE FROM atividades WHERE id = ?', [a.id]);
    await aposGravar('atividades', null, negocios);
    return 1;
  }

  // Aniversários dos contatos, ausências, foco e local de trabalho não são compromissos
  if (ev.eventType && !['default', 'fromGmail'].includes(ev.eventType)) return 0;
  const novo = camposDoEvento(ev);
  if (!novo.data_vencimento) return 0;
  // Reunião: o assunto leva o ícone do tipo, mesmo que o título no Google esteja sem ele
  const tipo = a ? a.tipo : tipoDoEvento(ev);
  novo.assunto = assuntoComIcone(novo.assunto, tipo);

  if (!a) {
    // Só o que ainda vai acontecer (o passado viraria tarefa pendente atrasada)
    if (novo.data_vencimento < hoje || novo.data_vencimento > limite) return 0;
    const [r] = await pool.query<any>(
      `INSERT INTO atividades (empresa_id, assunto, tipo, data_vencimento, hora_vencimento, duracao, observacao, lembrete_para, google_event_id, google_importada)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'nenhum', ?, 1)`,
      [empresaId, novo.assunto, tipo, novo.data_vencimento, novo.hora_vencimento, novo.duracao ?? '00:15:00', novo.observacao, chave],
    );
    await aposGravar('atividades', String(r.insertId));
    return 1;
  }

  // Só grava o que mudou de fato (o evento que o próprio CRM acabou de enviar volta igual)
  const mudou = diferencas(a, novo);
  if (!mudou.length) return 0;
  await pool.query(`UPDATE atividades SET ${mudou.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...mudou.map((c) => novo[c]), a.id]);
  await aposGravar('atividades', String(a.id));
  return 1;
}

// ---------------------------------------------------------------- CRM → Google (só TIPOS_NA_AGENDA)

/** O que mudar no evento para ficar igual à atividade (null = já está igual) */
export function alteracoesDoEvento(a: any, ev: any): Record<string, any> | null {
  const desejado: Record<string, any> = {
    assunto: a.assunto,
    observacao: a.observacao || null,
    data_vencimento: a.data_vencimento,
    hora_vencimento: a.hora_vencimento || null,
    ...(a.hora_vencimento ? { duracao: a.duracao || '00:15' } : {}),
  };
  const mudou = diferencas(camposDoEvento(ev), desejado);
  const patch: Record<string, any> = {};
  if (mudou.includes('assunto')) patch.summary = a.assunto;
  if (mudou.includes('observacao')) patch.description = a.observacao ?? '';
  if (mudou.some((c) => c === 'data_vencimento' || c === 'hora_vencimento' || c === 'duracao')) Object.assign(patch, periodoDa(a));
  // Concluída: cinza; reaberta: volta à cor da agenda (outra cor escolhida no Google fica)
  const cinza = ev.colorId === '8';
  if (Number(a.concluida) && !cinza) patch.colorId = '8';
  if (!Number(a.concluida) && cinza) patch.colorId = null;
  return Object.keys(patch).length ? patch : null;
}

async function enviar(empresaId: string, e: Estado, limite: number, ate: number): Promise<number> {
  const c = e.cursor;
  const [linhas] = await pool.query<any[]>(
    `SELECT t.id, t.assunto, t.data_vencimento, t.hora_vencimento, t.duracao, t.observacao, t.concluida, t.google_event_id,
            DATE_FORMAT(t.atualizado_em, '%Y-%m-%d %H:%i:%s') AS em,
            (SELECT GROUP_CONCAT(DISTINCT u.email) FROM usuarios u
              WHERE u.email LIKE '%@%' AND (u.id = t.executor_id OR u.id IN (SELECT v.usuario_id FROM atividade_envolvidos v WHERE v.atividade_id = t.id))) AS emails
       FROM atividades t
      WHERE t.empresa_id = ? AND t.tipo IN (?) AND (t.google_event_id IS NOT NULL OR t.data_vencimento >= CURDATE())
        ${c ? 'AND (t.atualizado_em > ? OR (t.atualizado_em = ? AND t.id > ?))' : ''}
      ORDER BY t.atualizado_em, t.id LIMIT ?`,
    [empresaId, TIPOS_NA_AGENDA, ...(c ? [c.em, c.em, c.id] : []), limite],
  );
  const destino = agendaDestino(e);
  let n = 0;
  for (const a of linhas) {
    if (Date.now() > ate) break;
    try {
      // O evento fica na agenda em que está (um evento lido de outra agenda é alterado lá)
      const v = a.google_event_id ? separarChave(a.google_event_id) : null;
      const url = v ? `${eventosDe(v.agenda)}/${encodeURIComponent(v.evento)}` : '';
      const atual = v ? await google(empresaId, e, 'GET', url) : null;
      if (atual?.status === 200 && atual.dados.status === 'cancelled') {
        // Excluído no Google: o recebimento exclui a atividade, não recria o evento
      } else if (atual?.status === 200) {
        const patch = alteracoesDoEvento(a, atual.dados);
        if (patch) {
          await google(empresaId, e, 'PATCH', `${url}?sendUpdates=none`, patch);
          n++;
        }
      } else {
        // Sem evento ou evento sumido (outra conta conectada): cria na agenda de destino. Convidados só aqui
        // (no PATCH a lista trocaria e zeraria as respostas deles)
        const convidados = a.emails ? String(a.emails).split(',') : [];
        const r = await google(empresaId, e, 'POST', `${eventosDe(destino)}?sendUpdates=none`, {
          summary: a.assunto,
          description: a.observacao ?? '',
          ...periodoDa(a),
          ...(Number(a.concluida) ? { colorId: '8' } : {}),
          ...(convidados.length ? { attendees: convidados.map((email) => ({ email })) } : {}),
          extendedProperties: { private: { crm_atividade: String(a.id), crm_empresa: empresaId } },
        });
        // Grava o vínculo sem mexer em atualizado_em (senão a atividade voltaria para a fila)
        await pool.query('UPDATE atividades SET google_event_id = ?, atualizado_em = atualizado_em WHERE id = ?', [chaveEvento(destino, r.dados.id), a.id]);
        n++;
      }
    } catch (err: any) {
      if (err.codigo === 'invalid_grant') throw err;
      // Uma atividade recusada pelo Google não segura a fila: fica registrada e segue
      console.error(`Google Agenda: atividade ${a.id} não enviada: ${err.message}`);
    }
    e.cursor = { em: a.em, id: a.id };
  }
  return n;
}

/** Excluída no cadastro: sai da agenda (falha fica para a limpeza de hora em hora, se o evento for do CRM) */
export async function apagarEventoGoogle(empresaId: string, chave: string | null) {
  if (!chave || !clientId()) return;
  const e: Estado | null = await lerConfig(empresaId, GRUPO, CHAVE);
  if (!e?.refresh_token || e.erro) return;
  const { agenda, evento } = separarChave(chave);
  await google(empresaId, e, 'DELETE', `${eventosDe(agenda)}/${encodeURIComponent(evento)}?sendUpdates=none`);
}

/** Eventos criados pelo CRM (com a marca) cuja atividade sumiu sem passar pelo cadastro (exclusão do negócio, em cascata) */
async function limpar(empresaId: string, e: Estado): Promise<number> {
  const eventos: string[] = [];
  for (const agenda of e.agendas || []) {
    let pagina = '';
    do {
      const q = new URLSearchParams({ privateExtendedProperty: `crm_empresa=${empresaId}`, maxResults: '2500', fields: 'nextPageToken,items(id)' });
      if (pagina) q.set('pageToken', pagina);
      const r = await google(empresaId, e, 'GET', `${eventosDe(agenda.id)}?${q}`);
      eventos.push(...(r.dados?.items || []).map((x: any) => chaveEvento(agenda.id, x.id)));
      pagina = r.dados?.nextPageToken || '';
    } while (pagina);
  }
  if (!eventos.length) return 0;
  const [vivas] = await pool.query<any[]>('SELECT google_event_id FROM atividades WHERE empresa_id = ? AND google_event_id IN (?)', [empresaId, eventos]);
  const ok = new Set(vivas.map((v) => v.google_event_id));
  let n = 0;
  for (const chave of eventos.filter((x) => !ok.has(x))) {
    const { agenda, evento } = separarChave(chave);
    await google(empresaId, e, 'DELETE', `${eventosDe(agenda)}/${encodeURIComponent(evento)}?sendUpdates=none`);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- Ciclo

/**
 * Um ciclo para todas as empresas conectadas.
 * Trava do MySQL: local e Vercel usam o mesmo banco e não podem criar a mesma atividade duas vezes.
 */
export async function sincronizarAgendas(tempoMs = 25_000, soEmpresa?: string) {
  if (!clientId() || !clientSecret()) return null;
  const ate = Date.now() + tempoMs;
  const con = await pool.getConnection();
  try {
    const [[{ ok }]] = await con.query<any[]>("SELECT GET_LOCK('crmweb_agenda_google', 0) AS ok");
    if (!ok) return 'em andamento';
    const [empresas] = await pool.query<any[]>(
      `SELECT empresa_id FROM config WHERE grupo = ? AND chave = ? AND valor LIKE ?${soEmpresa ? ' AND empresa_id = ?' : ''}`,
      [GRUPO, CHAVE, '%refresh_token%', ...(soEmpresa ? [soEmpresa] : [])],
    );
    const total = { recebidos: 0, enviados: 0, limpos: 0 };
    for (const { empresa_id } of empresas) {
      const empresaId = String(empresa_id);
      const e: Estado | null = await lerConfig(empresaId, GRUPO, CHAVE);
      if (!e?.refresh_token || e.erro) continue;
      try {
        // Agendas novas ou apagadas na conta entram/saem em até uma hora
        if (!e.agendas || Date.now() - (e.agendas_em || 0) > 3600_000) await carregarAgendas(empresaId, e);
        // Recebe antes de enviar: o que foi excluído no Google não é recriado
        total.recebidos += await receber(empresaId, e, ate);
        total.enviados += await enviar(empresaId, e, 100, ate);
        if (Date.now() - (e.limpeza_em || 0) > 3600_000 && Date.now() < ate) {
          total.limpos += await limpar(empresaId, e);
          e.limpeza_em = Date.now();
        }
        e.ultima_sinc = new Date().toISOString();
      } catch (err: any) {
        // Autorização revogada: para de tentar até reconectar
        if (err.codigo === 'invalid_grant') e.erro = 'A autorização do Google foi revogada ou expirou. Conecte de novo.';
        else console.error(`Google Agenda (empresa ${empresaId}): ${err.message}`);
      }
      // Durante o ciclo a tela pode ter desconectado, reconectado ou trocado o destino: isso prevalece
      const agora: Estado | null = await lerConfig(empresaId, GRUPO, CHAVE);
      if (agora?.refresh_token !== e.refresh_token) continue;
      e.destino = agora.destino;
      await gravarEstado(empresaId, e);
    }
    return total;
  } finally {
    await con.query("SELECT RELEASE_LOCK('crmweb_agenda_google')").catch(() => {});
    con.release();
  }
}

/** Fora da Vercel: um ciclo por minuto (na Vercel é o cron de /api/cron/whatsapp) */
export function iniciarAgendaGoogle() {
  setInterval(() => {
    sincronizarAgendas()
      .then((r) => r && typeof r === 'object' && (r.recebidos || r.enviados || r.limpos) && console.log('Google Agenda:', r))
      .catch((err) => console.error('Google Agenda: falha no ciclo:', err.message));
  }, 60_000);
}

// ---------------------------------------------------------------- Rotas

/** Volta do Google depois da autorização (pública: o navegador chega sem o token do CRM; o state é cifrado) */
export function createRetornoAgendaGoogleRouter(): Router {
  const router = Router();
  router.get('/api/agenda/google/retorno', async (req: Request, res: Response) => {
    const pagina = (msg: string) =>
      res.send(`<!doctype html><meta charset="utf-8"><title>Google Agenda</title><body style="font-family:sans-serif;padding:2rem">${msg}<p>Pode fechar esta janela.</p><script>setTimeout(()=>window.close(),2500)</script>`);
    try {
      if (req.query.error) return pagina('Conexão cancelada.');
      let s: { e: string; o: string; t: number };
      try {
        s = JSON.parse(decifrar(String(req.query.state || ''), 'Google Agenda'));
      } catch {
        return pagina('Link inválido. Clique em Conectar de novo nas Configurações.');
      }
      if (Date.now() - s.t > 15 * 60_000) return pagina('O link expirou. Clique em Conectar de novo.');
      const t = await token({ grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: redirectUri(s.o) });
      if (!t.refresh_token) return pagina('O Google não devolveu a autorização permanente. Remova o acesso do CRM na conta Google e conecte de novo.');
      const empresaId = String(s.e);
      // Reconectar (outra permissão, outra conta) mantém a agenda de destino escolhida, se ela ainda existir
      const anterior: Estado | null = await lerConfig(empresaId, GRUPO, CHAVE);
      const e: Estado = { refresh_token: cifrar(t.refresh_token), conta: '', conectado_em: new Date().toISOString(), destino: anterior?.destino ?? null };
      acessos.set(empresaId, { token: t.access_token, ate: Date.now() + (t.expires_in - 60) * 1000 });
      await carregarAgendas(empresaId, e);
      e.conta = e.agendas?.find((a) => a.principal)?.nome || '';
      await gravarEstado(empresaId, e);
      pagina(`Google Agenda conectada${e.conta ? ` (${e.conta})` : ''}: ${e.agendas?.length ?? 0} agenda(s). Os eventos começam a virar atividades em até um minuto.`);
    } catch (err: any) {
      pagina(`Falha ao conectar: ${err.message}`);
    }
  });
  return router;
}

export function createAgendaGoogleRouter(): Router {
  const router = Router();

  router.get('/agenda/google', async (_req: Request, res: Response) => {
    try {
      somenteAdmin(res);
      const e: Estado | null = await lerConfig(String(res.locals.empresaId), GRUPO, CHAVE);
      res.json({
        disponivel: Boolean(clientId() && clientSecret()),
        conectado: Boolean(e?.refresh_token),
        conta: e?.conta ?? null,
        conectado_em: e?.conectado_em ?? null,
        ultima_sinc: e?.ultima_sinc ?? null,
        erro: e?.erro ?? null,
        agendas: e?.agendas ?? [],
        destino: e ? agendaDestino(e) : null,
        reconectar: Boolean(e?.reconectar),
      });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /** "Sincronizar agora" da tela: o mesmo ciclo do cron, só para a empresa logada */
  router.post('/agenda/google/sincronizar', async (_req: Request, res: Response) => {
    try {
      somenteAdmin(res);
      const r = await sincronizarAgendas(25_000, String(res.locals.empresaId));
      if (r === 'em andamento') throw new Error('Uma sincronização já está em andamento. Tente de novo em instantes.');
      if (!r) throw new Error('Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor.');
      const e: Estado | null = await lerConfig(String(res.locals.empresaId), GRUPO, CHAVE);
      if (e?.erro) throw new Error(e.erro);
      res.json({ success: true, ...r });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /** Agenda que recebe as visitas e reuniões do CRM (uma das agendas lidas da conta) */
  router.put('/agenda/google/destino', async (req: Request, res: Response) => {
    try {
      somenteAdmin(res);
      const empresaId = String(res.locals.empresaId);
      const e: Estado | null = await lerConfig(empresaId, GRUPO, CHAVE);
      if (!e?.refresh_token) throw new Error('Conecte a Google Agenda antes.');
      const id = String(req.body?.id || '');
      if (!e.agendas?.some((a) => a.id === id)) throw new Error('Agenda não encontrada na conta conectada.');
      e.destino = id;
      await gravarEstado(empresaId, e);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  router.post('/agenda/google/conectar', async (req: Request, res: Response) => {
    try {
      somenteAdmin(res);
      if (!clientId() || !clientSecret()) throw new Error('Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor.');
      const origem = String(req.body?.origem || '');
      if (!/^https?:\/\/[^/]+$/.test(origem)) throw new Error('Endereço do CRM inválido.');
      const q = new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri(origem),
        response_type: 'code',
        scope: ESCOPO,
        access_type: 'offline',
        prompt: 'consent',
        state: cifrar(JSON.stringify({ e: res.locals.empresaId, o: origem, t: Date.now() })),
      });
      res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  router.post('/agenda/google/desconectar', async (_req: Request, res: Response) => {
    try {
      somenteAdmin(res);
      const empresaId = String(res.locals.empresaId);
      const e: Estado | null = await lerConfig(empresaId, GRUPO, CHAVE);
      if (e?.refresh_token) {
        // Revoga no Google (se falhar, a conta ainda pode remover o acesso por lá)
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decifrar(e.refresh_token, 'Google Agenda'))}`, { method: 'POST' }).catch(() => {});
      }
      await gravarEstado(empresaId, null);
      acessos.delete(empresaId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return router;
}
