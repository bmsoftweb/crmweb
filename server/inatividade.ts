import { pool } from './db.js';
import { encerrarAtendimento, marcarEncerramento, minutosInatividade, type ConfigChatbot } from './chatbot.js';
import { enviarReservada, reservarEnvio } from './whatsapp.js';

/**
 * Encerramento por falta de interação no WhatsApp. A última mensagem da conversa foi do bot ou do técnico, o
 * cliente já tinha escrito neste atendimento e não respondeu em X minutos (Configurações › Chatbot): o bot avisa
 * que vai encerrar; 30 s depois do aviso, sem resposta, encerra (linha de encerramento, sem pesquisa de satisfação:
 * o cliente estava ausente). Não entram: conversa aguardando atendente (quem espera é o cliente), parada num Esperar da Automação
 * e mensagens de campanha/automáticas. Roda no cron do WhatsApp (Vercel) e no setInterval local, com trava no
 * MySQL: os dois usam o mesmo banco e o aviso não pode sair duas vezes.
 */

export const AVISO_INATIVIDADE =
  'Como não tivemos resposta, este atendimento será encerrado em 30 segundos. Se ainda precisar de ajuda, é só responder por aqui.';
const TEXTO_ENCERRAMENTO = 'Atendimento encerrado por falta de interação do cliente';
/** Espera depois do aviso */
const ESPERA_S = 30;
/** Mensagem mais velha que o prazo + esta janela não é avisada (servidor parado, conversa antiga) */
const JANELA_MIN = 60;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Última mensagem de cada conversa candidata: do bot (origem bot:), do técnico (origem vazia) ou o próprio aviso
 * (origem inatividade:), já entregue ao provedor, com o cliente tendo escrito depois do último encerramento
 */
async function candidatas(empresaId: number, minutos: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT c.telefone, c.departamento_id, c.atendente_id, u.nome AS atendente_nome, m.id, m.origem,
            TIMESTAMPDIFF(SECOND, m.data_hora, NOW()) AS idade
       FROM whatsapp_conversas c
       JOIN whatsapp_mensagens m ON m.id = (SELECT MAX(z.id) FROM whatsapp_mensagens z
                                             WHERE z.empresa_id = c.empresa_id AND z.telefone = c.telefone AND z.tipo <> 'evento')
       LEFT JOIN usuarios u ON u.id = c.atendente_id
      WHERE c.empresa_id = ? AND c.retomar_em IS NULL
        AND NOT (c.atendimento = 'humano' AND c.atendente_id IS NULL)
        AND m.direcao = 'enviada' AND m.tipo <> 'encerramento' AND m.situacao <> 'pendente'
        AND (m.origem IS NULL OR m.origem LIKE 'bot:%' OR m.origem LIKE 'inatividade:%')
        AND m.data_hora > NOW() - INTERVAL ? MINUTE
        AND EXISTS (SELECT 1 FROM whatsapp_mensagens r
                     WHERE r.empresa_id = c.empresa_id AND r.telefone = c.telefone AND r.direcao = 'recebida'
                       AND r.id > COALESCE((SELECT MAX(e.id) FROM whatsapp_mensagens e
                                             WHERE e.empresa_id = c.empresa_id AND e.telefone = c.telefone AND e.tipo = 'encerramento'), 0))`,
    [empresaId, minutos + JANELA_MIN],
  );
  return rows;
}

/** Um passe: encerra as avisadas há 30 s ou mais e avisa as paradas há X minutos. Devolve quantas avisou */
async function passe(empresaId: number, minutos: number): Promise<{ avisadas: number; encerradas: number }> {
  let avisadas = 0;
  let encerradas = 0;
  for (const c of await candidatas(empresaId, minutos)) {
    const idade = Number(c.idade);
    try {
      if (String(c.origem ?? '').startsWith('inatividade:')) {
        if (idade < ESPERA_S) continue;
        await encerrarAtendimento(empresaId, c.telefone);
        await marcarEncerramento(empresaId, c.telefone, null, null, TEXTO_ENCERRAMENTO);
        // Sem pesquisa: o cliente estava ausente, e a resposta atrasada (depois da validade) abriria um atendimento novo
        encerradas++;
      } else if (idade >= minutos * 60) {
        // Origem com o id da última mensagem: o mesmo silêncio não gera dois avisos
        const origem = `inatividade:${c.telefone}:${c.id}`;
        const [d] = await pool.query<any[]>('SELECT MAX(pessoa_id) AS pessoa_id, MAX(contato_id) AS contato_id FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ?', [
          empresaId,
          c.telefone,
        ]);
        const id = await reservarEnvio(empresaId, origem, { pessoa_id: d[0]?.pessoa_id ?? null, contato_id: d[0]?.contato_id ?? null }, c.telefone, AVISO_INATIVIDADE);
        if (!id) continue;
        await enviarReservada(empresaId, id, origem, c.telefone, AVISO_INATIVIDADE);
        avisadas++;
      }
    } catch (err: any) {
      console.error(`Inatividade (${c.telefone}): ${err.message}`);
    }
  }
  return { avisadas, encerradas };
}

/**
 * Um ciclo (cron a cada minuto): um passe em cada empresa com o encerramento ligado; se avisou alguém, espera os
 * 30 s e passa de novo, para encerrar na hora certa em vez de só no próximo minuto. Devolve os totais.
 */
export async function verificarInatividade(): Promise<{ avisadas: number; encerradas: number }> {
  const total = { avisadas: 0, encerradas: 0 };
  const conn = await pool.getConnection();
  try {
    const [trava] = await conn.query<any[]>("SELECT GET_LOCK('crmweb_inatividade', 0) AS ok");
    if (!trava[0]?.ok) return total;
    try {
      const [cfgs] = await pool.query<any[]>("SELECT empresa_id, valor FROM config WHERE grupo = 'whatsapp' AND chave = 'chatbot'");
      const empresas = cfgs
        .map((r) => ({ id: Number(r.empresa_id), minutos: minutosInatividade(JSON.parse(r.valor || 'null') as ConfigChatbot | null) }))
        .filter((e) => e.minutos > 0);
      const somar = (r: { avisadas: number; encerradas: number }) => {
        total.avisadas += r.avisadas;
        total.encerradas += r.encerradas;
        return r.avisadas;
      };
      let avisou = 0;
      for (const e of empresas) avisou += somar(await passe(e.id, e.minutos));
      if (avisou) {
        await esperar((ESPERA_S + 1) * 1000);
        for (const e of empresas) somar(await passe(e.id, e.minutos));
      }
    } finally {
      await conn.query("SELECT RELEASE_LOCK('crmweb_inatividade')");
    }
  } finally {
    conn.release();
  }
  return total;
}

/** Fora da Vercel: um ciclo a cada minuto (na Vercel é o cron de /api/cron/whatsapp) */
export function iniciarInatividade() {
  let rodando = false;
  setInterval(async () => {
    if (rodando) return;
    rodando = true;
    try {
      const r = await verificarInatividade();
      if (r.avisadas || r.encerradas) console.log(`Inatividade: ${r.avisadas} aviso(s), ${r.encerradas} encerrado(s).`);
    } catch (err: any) {
      console.error('Inatividade: falha no ciclo:', err.message);
    } finally {
      rodando = false;
    }
  }, 60_000);
}
