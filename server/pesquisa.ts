import { pool } from './db.js';
import { lerConfig } from './config.js';
import { textoConfig } from './segredo.js';
import { enviarReservada, reservarEnvio, type MensagemNova } from './whatsapp.js';
import { marcarEvento } from './chatbot.js';

/**
 * Pesquisa de satisfação do WhatsApp (Configurações › Chatbot › Pesquisa de satisfação; tabela
 * avaliacoes). Sai ao Encerrar pela equipe e no fim da jornada: nota de 1 a 5 (número ou estrelas);
 * nota de 1 a 3 pede um comentário. A resposta do cliente é tratada aqui, antes do bot/jornada; o que
 * não for uma nota descarta a pesquisa e segue o atendimento normal.
 */

export interface ConfigPesquisa {
  ativo: boolean;
  /** Pergunta; {{atendente}} = quem atendeu (ou o nome do bot). As opções de 1 a 5 vão embaixo */
  pergunta: string;
  /** Pedido de comentário para nota de 1 a 3 */
  comentario: string;
  agradecimento: string;
  /** Pesquisa sem resposta vence depois disso (minutos) */
  minutos: number;
}

const PADRAO: ConfigPesquisa = {
  ativo: false,
  pergunta: 'Como você avalia o atendimento de {{atendente}}? Responda com um número de 1 a 5:',
  comentario: 'Sentimos muito. O que podemos melhorar?',
  agradecimento: 'Obrigado pela sua avaliação!',
  minutos: 1440,
};

/** Opções embaixo da pergunta (fixas: é por elas que a resposta é entendida) */
export const OPCOES_NOTA = '1 ⭐ Péssimo\n2 ⭐⭐ Ruim\n3 ⭐⭐⭐ Regular\n4 ⭐⭐⭐⭐ Bom\n5 ⭐⭐⭐⭐⭐ Ótimo';

export function prepararPesquisa(valor: any): ConfigPesquisa {
  const cfg: ConfigPesquisa = {
    ativo: Boolean(valor?.ativo),
    pergunta: textoConfig(valor?.pergunta, 1000, 'Pesquisa: pergunta') || PADRAO.pergunta,
    comentario: textoConfig(valor?.comentario, 1000, 'Pesquisa: pedido de comentário') || PADRAO.comentario,
    agradecimento: textoConfig(valor?.agradecimento, 1000, 'Pesquisa: agradecimento') || PADRAO.agradecimento,
    minutos: Number(valor?.minutos ?? PADRAO.minutos),
  };
  if (!Number.isInteger(cfg.minutos) || cfg.minutos < 1 || cfg.minutos > 43_200) throw new Error('Pesquisa: a validade deve ser de 1 a 43.200 minutos (30 dias).');
  return cfg;
}

export const pesquisaPublica = (cfg: ConfigPesquisa | null) => ({ ...PADRAO, ...(cfg ?? {}), opcoes: OPCOES_NOTA });

const lerPesquisa = async (empresaId: string | number): Promise<ConfigPesquisa> => ({ ...PADRAO, ...((await lerConfig(String(empresaId), 'whatsapp', 'pesquisa')) ?? {}) });

/** "4", " 4 ", "4 estrelas", "⭐⭐⭐⭐", "****" → 4; o que não for uma nota → null */
export function lerNota(texto: string): number | null {
  const t = texto.trim();
  const n = /^([1-5])(\s*(estrelas?|⭐+))?[.!]?$/i.exec(t);
  if (n) return Number(n[1]);
  const estrelas = [...t].filter((c) => c === '⭐' || c === '🌟' || c === '*').length;
  const resto = t.replace(/[⭐🌟*\s️]/gu, '');
  return !resto && estrelas >= 1 && estrelas <= 5 ? estrelas : null;
}

/** Texto da mensagem da equipe/bot, reservado antes (aviso repetido da Evolution não duplica) */
async function mandar(empresaId: number, telefone: string, origem: string, texto: string) {
  const id = await reservarEnvio(empresaId, origem, { pessoa_id: null, contato_id: null }, telefone, texto);
  if (id) await enviarReservada(empresaId, id, origem, telefone, texto);
}

/**
 * Envia a pesquisa (se ligada). Pesquisa anterior do mesmo número ainda sem resposta é descartada.
 * atendente null = atendimento do bot/jornada (a pergunta usa o nome do bot).
 */
export async function enviarPesquisa(
  empresaId: string | number,
  telefone: string,
  origem: 'atendente' | 'jornada',
  atendente: { id: number; nome: string } | null,
  departamentoId: number | null,
): Promise<void> {
  const cfg = await lerPesquisa(empresaId);
  if (!cfg.ativo) return;
  const emp = Number(empresaId);
  await pool.query(
    "UPDATE avaliacoes SET situacao = 'expirada' WHERE empresa_id = ? AND telefone = ? AND situacao IN ('aguardando_nota', 'aguardando_comentario')",
    [emp, telefone],
  );
  const [p] = await pool.query<any[]>('SELECT MAX(pessoa_id) AS pessoa_id FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ?', [emp, telefone]);
  const [a] = await pool.query<any>(
    `INSERT INTO avaliacoes (empresa_id, telefone, pessoa_id, atendente_id, departamento_id, origem, situacao, pedida_em)
     VALUES (?, ?, ?, ?, ?, ?, 'aguardando_nota', NOW())`,
    [emp, telefone, p[0]?.pessoa_id ?? null, atendente?.id ?? null, departamentoId, origem],
  );
  const bot: any = await lerConfig(String(emp), 'whatsapp', 'chatbot');
  const quem = atendente?.nome || bot?.nome || 'nossa equipe';
  const texto = `${cfg.pergunta.replace(/\{\{\s*atendente\s*\}\}/g, quem)}\n${OPCOES_NOTA}`;
  try {
    await mandar(emp, telefone, `pesquisa:${a.insertId}`, texto);
  } catch (err: any) {
    await pool.query("UPDATE avaliacoes SET situacao = 'expirada' WHERE id = ?", [a.insertId]);
    console.error(`Pesquisa: não enviada para ${telefone}: ${err.message}`);
  }
}

const estrelas = (n: number) => '⭐'.repeat(n);

/**
 * Mensagem recebida: se o número tem pesquisa esperando resposta, trata aqui (nota ou comentário) e
 * devolve true (o bot/jornada não respondem). O que não for nota descarta a pesquisa (false: segue).
 */
export async function tratarRespostaPesquisa(nova: MensagemNova): Promise<boolean> {
  const cfg = await lerPesquisa(nova.empresaId);
  const [pend] = await pool.query<any[]>(
    `SELECT id, situacao FROM avaliacoes
      WHERE empresa_id = ? AND telefone = ? AND situacao IN ('aguardando_nota', 'aguardando_comentario') AND pedida_em > NOW() - INTERVAL ? MINUTE
      ORDER BY id DESC LIMIT 1`,
    [nova.empresaId, nova.telefone, cfg.minutos],
  );
  const av = pend[0];
  if (!av) return false;
  const [m] = await pool.query<any[]>('SELECT tipo, texto FROM whatsapp_mensagens WHERE id = ?', [nova.id]);
  const texto = m[0]?.tipo === 'texto' ? String(m[0].texto ?? '') : `[${m[0]?.tipo ?? 'mensagem'}]`;
  // A resposta da pesquisa não entra no histórico da IA nem conta como atendimento
  const marcarResposta = () =>
    pool.query('UPDATE whatsapp_mensagens SET origem = ? WHERE id = ? AND origem IS NULL', [`pesquisa-resposta:${av.id}:${nova.id}`, nova.id]);
  // Pausa curta de gente antes de responder (1 a 4 s)
  const pausa = () => new Promise((ok) => setTimeout(ok, 1000 + Math.random() * 3000));

  if (av.situacao === 'aguardando_nota') {
    const nota = lerNota(texto);
    if (nota === null) {
      // Não respondeu a pesquisa: segue o atendimento normal
      await pool.query("UPDATE avaliacoes SET situacao = 'expirada' WHERE id = ?", [av.id]);
      return false;
    }
    const pedeComentario = nota <= 3;
    await pool.query('UPDATE avaliacoes SET nota = ?, situacao = ?, respondida_em = NOW() WHERE id = ?', [nota, pedeComentario ? 'aguardando_comentario' : 'respondida', av.id]);
    await marcarResposta();
    await marcarEvento(nova.empresaId, nova.telefone, `Cliente avaliou ${estrelas(nota)} (${nota})`, null);
    await pausa();
    await mandar(nova.empresaId, nova.telefone, `pesquisa-${pedeComentario ? 'comentario' : 'obrigado'}:${av.id}`, pedeComentario ? cfg.comentario : cfg.agradecimento);
    return true;
  }

  // Comentário da nota baixa
  await pool.query("UPDATE avaliacoes SET comentario = ?, situacao = 'respondida' WHERE id = ?", [texto.slice(0, 2000), av.id]);
  await marcarResposta();
  await marcarEvento(nova.empresaId, nova.telefone, `Comentário da avaliação: ${texto.slice(0, 200)}`, null);
  await pausa();
  await mandar(nova.empresaId, nova.telefone, `pesquisa-obrigado:${av.id}`, cfg.agradecimento);
  return true;
}
