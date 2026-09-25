import { pool } from './db.js';
import { tirarProprietarioDosEnvolvidos } from './participantes.js';
import { calcularSegmento, normalizarCriterios, variaveisDoTexto } from './campanhas.js';
import { recalcularContrato } from './contratos.js';

/**
 * Regras aplicadas depois de qualquer gravação, venha ela das telas genéricas de CRUD,
 * do Kanban ou dos editores de proposta/pedido. Assim os campos calculados do negócio
 * nunca dependem de qual tela fez a alteração.
 *
 * As datas usam NOW() do MySQL, que roda em UTC-3 (ver db.ts).
 */

type Executor = { query: typeof pool.query };

/**
 * Recalcula os campos de follow-up do negócio:
 *  - data_proximo_followup: a atividade pendente mais próxima (vazio = nenhuma agendada);
 *  - data_ultimo_contato: a última atividade concluída ou interação registrada.
 */
export async function sincronizarNegocio(negocioId: string | null | undefined, db: Executor = pool) {
  if (!negocioId) return;
  await db.query(
    `UPDATE negocios n SET
        n.data_proximo_followup = (
          SELECT MIN(TIMESTAMP(a.data_vencimento, COALESCE(a.hora_vencimento, '00:00:00')))
            FROM atividades a WHERE a.negocio_id = n.id AND a.concluida = 0),
        n.data_ultimo_contato = NULLIF(GREATEST(
          COALESCE((SELECT MAX(a.concluida_em) FROM atividades a WHERE a.negocio_id = n.id AND a.concluida = 1), '1000-01-01 00:00:00'),
          COALESCE((SELECT MAX(h.criado_em) FROM historico_interacoes h WHERE h.negocio_id = n.id), '1000-01-01 00:00:00')
        ), '1000-01-01 00:00:00')
      WHERE n.id = ?`,
    [negocioId],
  );
}

/**
 * Ajustes no que vai ser gravado. Negócio: o funil vem sempre da etapa escolhida,
 * para que funil e etapa nunca fiquem desencontrados.
 */
export async function antesDeGravar(recurso: string, payload: Record<string, any>, empresaId?: string) {
  // Contato: a pessoa precisa ser da empresa logada (o campo não é um vínculo escolhido na tela)
  if (recurso === 'pessoas_contatos' && payload.pessoa_id != null) {
    const [rows] = await pool.query<any[]>('SELECT 1 FROM pessoas WHERE id = ? AND empresa_id = ?', [payload.pessoa_id, empresaId]);
    if (!rows.length) throw new Error('A pessoa do contato não existe nesta empresa.');
  }
  if (recurso === 'atividades' && payload.executor_id && payload.departamento_id) {
    throw new Error('Quem executa: escolha um usuário ou um departamento, não os dois (os dois vazios = qualquer pessoa).');
  }
  if (recurso === 'negocios' && payload.etapa_id) {
    const [rows] = await pool.query<any[]>('SELECT funil_id FROM etapas WHERE id = ?', [payload.etapa_id]);
    if (!rows.length) throw new Error('A etapa escolhida não existe.');
    payload.funil_id = rows[0].funil_id;
  }
  if (recurso === 'campanha_segmentos' && 'criterios' in payload) {
    payload.criterios = JSON.stringify(normalizarCriterios(payload.criterios));
  }
  if (recurso === 'contratos') {
    const dia = payload.dia_vencimento;
    if (dia != null && (dia < 1 || dia > 31)) throw new Error('O dia de vencimento deve ser de 1 a 31.');
    if (payload.data_fim && payload.data_inicio && payload.data_fim < payload.data_inicio) {
      throw new Error('O fim do contrato não pode ser antes do início.');
    }
  }
  if (recurso === 'contrato_itens' && payload.produto_id) {
    // Sem valor informado, vale o preço de tabela do produto
    if (payload.preco_unitario == null) {
      const [rows] = await pool.query<any[]>('SELECT preco_tabela FROM produtos WHERE id = ?', [payload.produto_id]);
      payload.preco_unitario = Number(rows[0]?.preco_tabela) || 0;
    }
    const quantidade = Number(payload.quantidade ?? 1);
    const bruto = quantidade * Number(payload.preco_unitario || 0);
    const desconto = Number(payload.desconto || 0);
    if (quantidade <= 0) throw new Error('A quantidade deve ser maior que zero.');
    if (desconto < 0 || desconto > bruto) throw new Error('O desconto não pode passar do valor do item.');
    payload.subtotal = Math.round((bruto - desconto) * 100) / 100;
  }
  if (recurso === 'campanha_mensagens') {
    // Lista das variáveis usadas, guardada para o envio; variável inexistente barra a gravação
    if ('corpo' in payload || 'assunto' in payload) payload.variaveis = JSON.stringify(variaveisDoTexto(payload.assunto, payload.corpo));
    if (payload.segmento_id && payload.campanha_id) {
      const [rows] = await pool.query<any[]>('SELECT 1 FROM campanha_segmentos WHERE id = ? AND campanha_id = ?', [payload.segmento_id, payload.campanha_id]);
      if (!rows.length) throw new Error('O segmento escolhido é de outra campanha.');
    }
  }
}

/** Negócios ligados ao registro, lidos antes de alterá-lo ou excluí-lo */
export async function antesDeExcluir(recurso: string, id: string): Promise<string[]> {
  if (recurso !== 'atividades' && recurso !== 'historico_interacoes') return [];
  const [rows] = await pool.query<any[]>(`SELECT negocio_id FROM ${recurso} WHERE id = ?`, [id]);
  return rows.map((r) => r.negocio_id).filter(Boolean);
}

export async function aposGravar(recurso: string, id: string | null, negociosAnteriores: string[] = [], db: Executor = pool) {
  const negocios = new Set(negociosAnteriores);

  // Cadastro feito aqui no CRM ganha o código "CRMWEB-<id>"; quem veio de fora
  // (importação do bmsoft, por exemplo) já chega com o código do sistema de origem
  if (recurso === 'pessoas' && id) {
    await db.query("UPDATE pessoas SET cod_integracao = CONCAT('CRMWEB-', id) WHERE id = ? AND cod_integracao IS NULL", [id]);
  }

  // Contato: um principal só por pessoa, e ativo (sem nenhum marcado, o primeiro ativo assume)
  if (recurso === 'pessoas_contatos' && id) {
    const [rows] = await db.query<any[]>('SELECT pessoa_id, principal, ativo FROM pessoas_contatos WHERE id = ?', [id]);
    const c = rows[0];
    if (c) {
      if (Number(c.principal) && !Number(c.ativo)) await db.query('UPDATE pessoas_contatos SET principal = 0 WHERE id = ?', [id]);
      else if (Number(c.principal)) await db.query('UPDATE pessoas_contatos SET principal = 0 WHERE pessoa_id = ? AND id <> ?', [c.pessoa_id, id]);
      await db.query(
        `UPDATE pessoas_contatos SET principal = 1
          WHERE id = (SELECT id FROM (SELECT id FROM pessoas_contatos WHERE pessoa_id = ? AND ativo = 1 ORDER BY id LIMIT 1) primeiro)
            AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM pessoas_contatos WHERE pessoa_id = ? AND principal = 1 AND ativo = 1) marcado)`,
        [c.pessoa_id, c.pessoa_id],
      );
    }
  }

  if (recurso === 'negocios' && id) {
    // Data do ganho/perda acompanha o status; reaberto, as duas voltam a ficar vazias
    await db.query(
      `UPDATE negocios SET
          data_ganho = IF(status = 'ganho', COALESCE(data_ganho, NOW()), NULL),
          data_perda = IF(status = 'perdido', COALESCE(data_perda, NOW()), NULL),
          motivo_perda = IF(status = 'perdido', motivo_perda, NULL)
        WHERE id = ?`,
      [id],
    );
    // Trocou o proprietário (inclusive pela troca rápida): ele sai dos envolvidos
    await tirarProprietarioDosEnvolvidos(id, db);
  }

  if (recurso === 'atividades' && id) {
    await db.query(
      `UPDATE atividades SET concluida_em = IF(concluida = 1, COALESCE(concluida_em, NOW()), NULL) WHERE id = ?`,
      [id],
    );
  }

  if ((recurso === 'atividades' || recurso === 'historico_interacoes') && id) {
    const [rows] = await db.query<any[]>(`SELECT negocio_id FROM ${recurso} WHERE id = ?`, [id]);
    if (rows[0]?.negocio_id) negocios.add(rows[0].negocio_id);
  }

  // Totais do contrato acompanham os itens, as datas e a periodicidade
  if (recurso === 'contratos' && id) await recalcularContrato(id, db);
  if (recurso === 'contrato_itens' && id) {
    const [rows] = await db.query<any[]>('SELECT contrato_id FROM contrato_itens WHERE id = ?', [id]);
    if (rows[0]) await recalcularContrato(rows[0].contrato_id, db);
  }

  // Público do segmento acompanha os critérios gravados
  if (recurso === 'campanha_segmentos' && id) {
    const [rows] = await db.query<any[]>(
      'SELECT c.empresa_id FROM campanha_segmentos s JOIN campanhas c ON c.id = s.campanha_id WHERE s.id = ?',
      [id],
    );
    if (rows.length) await calcularSegmento(Number(id), String(rows[0].empresa_id), db);
  }

  // Campanha encerrada (concluída, cancelada ou excluída): data de encerramento e
  // os disparos que ainda não saíram são cancelados
  if (recurso === 'campanhas' && id) {
    await db.query(
      `UPDATE campanhas SET encerrada_em = IF(situacao IN ('concluida', 'cancelada') OR excluida_em IS NOT NULL, COALESCE(encerrada_em, NOW()), NULL)
        WHERE id = ?`,
      [id],
    );
    await db.query(
      `UPDATE disparos_mensagens d JOIN campanha_mensagens m ON m.id = d.mensagem_id JOIN campanhas c ON c.id = m.campanha_id
          SET d.situacao = 'cancelado'
        WHERE c.id = ? AND d.situacao = 'pendente' AND (c.situacao IN ('concluida', 'cancelada') OR c.excluida_em IS NOT NULL)`,
      [id],
    );
  }

  for (const n of negocios) await sincronizarNegocio(n, db);
}
