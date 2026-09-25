import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { friendlyDbError } from './crud.js';

/**
 * Campanhas: segmentos calculados por critérios, mensagens com variáveis ({{nome}})
 * e a fila de disparos "pendente", agendados. O envio por WhatsApp é feito por
 * server/whatsapp.ts; os demais canais ficam na fila.
 */

type Executor = { query: typeof pool.query };

// ------------------------------------------------------------
// Critérios de segmentação
// ------------------------------------------------------------

export const OPERADORES = ['=', '<>', '>', '>=', '<', '<='] as const;
type Operador = (typeof OPERADORES)[number];

/**
 * Regras aceitas nos critérios. `sql` é uma expressão sobre a pessoa (alias "p")
 * comparada com o valor pelo operador; nada do navegador entra no SQL além do valor,
 * que vai como parâmetro.
 */
export const REGRAS: Record<string, { rotulo: string; valor: 'numero' | 'texto' | 'sim_nao' | 'tipo_pessoa' | 'segmento'; sql: string }> = {
  tipo: { rotulo: 'Tipo da pessoa', valor: 'tipo_pessoa', sql: 'p.tipo' },
  segmento: { rotulo: 'Segmento da pessoa', valor: 'segmento', sql: 'p.segmento_id' },
  uf: {
    rotulo: 'UF do endereço principal',
    valor: 'texto',
    sql: `(SELECT e.uf FROM pessoas_enderecos e WHERE e.pessoa_id = p.id ORDER BY e.principal DESC, e.id LIMIT 1)`,
  },
  cidade: {
    rotulo: 'Cidade do endereço principal',
    valor: 'texto',
    sql: `(SELECT e.cidade FROM pessoas_enderecos e WHERE e.pessoa_id = p.id ORDER BY e.principal DESC, e.id LIMIT 1)`,
  },
  dias_cadastro: { rotulo: 'Dias desde o cadastro', valor: 'numero', sql: 'DATEDIFF(CURDATE(), p.criado_em)' },
  // Quem nunca comprou fica de fora (sem data): para esses, usar "Quantidade de pedidos = 0"
  ultima_compra: {
    rotulo: 'Dias desde a última compra',
    valor: 'numero',
    sql: `DATEDIFF(CURDATE(), (SELECT MAX(pd.data_emissao) FROM pedidos pd WHERE pd.pessoa_id = p.id AND pd.status <> 'cancelado'))`,
  },
  qtd_pedidos: {
    rotulo: 'Quantidade de pedidos',
    valor: 'numero',
    sql: `(SELECT COUNT(*) FROM pedidos pd WHERE pd.pessoa_id = p.id AND pd.status <> 'cancelado')`,
  },
  ultimo_contato: {
    rotulo: 'Dias desde o último contato',
    valor: 'numero',
    sql: `DATEDIFF(CURDATE(), (SELECT MAX(h.criado_em) FROM historico_interacoes h WHERE h.pessoa_id = p.id))`,
  },
  negocio_aberto: {
    rotulo: 'Tem negócio aberto',
    valor: 'sim_nao',
    sql: `EXISTS (SELECT 1 FROM negocios n WHERE n.pessoa_id = p.id AND n.status = 'aberto')`,
  },
  negocio_ganho: {
    rotulo: 'Tem negócio ganho',
    valor: 'sim_nao',
    sql: `EXISTS (SELECT 1 FROM negocios n WHERE n.pessoa_id = p.id AND n.status = 'ganho')`,
  },
  contrato_ativo: {
    rotulo: 'Tem contrato ativo',
    valor: 'sim_nao',
    sql: `EXISTS (SELECT 1 FROM contratos ct WHERE ct.pessoa_id = p.id AND ct.situacao = 'ativo')`,
  },
  // Quem não tem contrato ativo com data de fim fica de fora (sem data)
  dias_fim_contrato: {
    rotulo: 'Dias até o fim do contrato',
    valor: 'numero',
    sql: `(SELECT DATEDIFF(MIN(ct.data_fim), CURDATE()) FROM contratos ct WHERE ct.pessoa_id = p.id AND ct.situacao = 'ativo' AND ct.data_fim IS NOT NULL)`,
  },
  tem_email: { rotulo: 'Tem e-mail', valor: 'sim_nao', sql: `(p.email IS NOT NULL AND p.email <> '')` },
  tem_telefone: { rotulo: 'Tem telefone', valor: 'sim_nao', sql: `(p.telefone IS NOT NULL AND p.telefone <> '')` },
  tem_whatsapp: { rotulo: 'Tem WhatsApp cadastrado', valor: 'sim_nao', sql: `(p.whatsapp IS NOT NULL AND p.whatsapp <> '')` },
  // DDD + 9 + 8 dígitos (com ou sem 0/55 na frente), no WhatsApp ou, sem ele, no telefone; sem DDD não dá para mandar WhatsApp
  tem_celular: {
    rotulo: 'Tem celular (com DDD)',
    valor: 'sim_nao',
    sql: `(REGEXP_REPLACE(COALESCE(NULLIF(p.whatsapp, ''), p.telefone, ''), '[^0-9]', '') REGEXP '^0*(55)?[1-9]{2}9[0-9]{8}$')`,
  },
};

export interface Criterio {
  regra: string;
  operador: Operador;
  valor: string | number;
}

/**
 * Valida os critérios vindos do formulário (lista de regras, todas precisam valer).
 * Aceita também um objeto só, como no exemplo do migration.
 */
export function normalizarCriterios(bruto: unknown): Criterio[] {
  let v = bruto;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      throw new Error('Os critérios estão em formato inválido.');
    }
  }
  if (v && !Array.isArray(v) && typeof v === 'object') v = [v];
  if (!Array.isArray(v) || !v.length) throw new Error('Informe ao menos um critério do segmento.');
  if (v.length > 20) throw new Error('São aceitos no máximo 20 critérios por segmento.');

  return v.map((c: any, i) => {
    const regra = REGRAS[String(c?.regra)];
    if (!regra) throw new Error(`Critério ${i + 1}: regra "${c?.regra}" não existe.`);
    const operador = String(c?.operador) as Operador;
    if (!OPERADORES.includes(operador)) throw new Error(`Critério ${i + 1}: operador "${c?.operador}" inválido.`);
    let valor: string | number = c?.valor ?? '';
    if (regra.valor === 'numero' || regra.valor === 'segmento') {
      valor = Number(valor);
      if (!Number.isFinite(valor)) throw new Error(`Critério ${i + 1} (${regra.rotulo}): informe um número.`);
    } else if (regra.valor === 'sim_nao') {
      valor = Number(valor) ? 1 : 0;
      if (operador !== '=' && operador !== '<>') throw new Error(`Critério ${i + 1} (${regra.rotulo}): use "=" ou "<>".`);
    } else {
      valor = String(valor).trim();
      if (!valor) throw new Error(`Critério ${i + 1} (${regra.rotulo}): informe o valor.`);
    }
    return { regra: String(c.regra), operador, valor };
  });
}

/** WHERE (sobre a pessoa "p") que seleciona as pessoas da empresa atendidas pelos critérios */
export function sqlCriterios(criterios: Criterio[], empresaId: string | number): { where: string; params: any[] } {
  const partes = ['p.empresa_id = ?'];
  const params: any[] = [empresaId];
  for (const c of criterios) {
    partes.push(`${REGRAS[c.regra].sql} ${c.operador} ?`);
    params.push(c.valor);
  }
  return { where: partes.join(' AND '), params };
}

/**
 * Refaz o público do segmento (campanha_segmento_pessoas) a partir dos critérios e
 * atualiza o tamanho_estimado. Devolve quantas pessoas entraram.
 */
export async function calcularSegmento(segmentoId: number, empresaId: string, db: Executor = pool): Promise<number> {
  const [segs] = await db.query<any[]>(
    `SELECT s.criterios FROM campanha_segmentos s JOIN campanhas c ON c.id = s.campanha_id
      WHERE s.id = ? AND c.empresa_id = ?`,
    [segmentoId, empresaId],
  );
  if (!segs.length) throw new Error('Segmento não encontrado.');
  const { where, params } = sqlCriterios(normalizarCriterios(segs[0].criterios), empresaId);

  await db.query('DELETE FROM campanha_segmento_pessoas WHERE segmento_id = ?', [segmentoId]);
  const [r] = await db.query<any>(
    `INSERT INTO campanha_segmento_pessoas (segmento_id, pessoa_id) SELECT ?, p.id FROM pessoas p WHERE ${where}`,
    [segmentoId, ...params],
  );
  await db.query('UPDATE campanha_segmentos SET tamanho_estimado = ? WHERE id = ?', [r.affectedRows, segmentoId]);
  return r.affectedRows;
}

// ------------------------------------------------------------
// Variáveis das mensagens
// ------------------------------------------------------------

/** Variáveis aceitas em {{...}} no assunto e no corpo, e de onde vem cada uma */
export const VARIAVEIS: Record<string, string> = {
  nome: 'p.nome',
  primeiro_nome: "SUBSTRING_INDEX(TRIM(p.nome), ' ', 1)",
  email: 'p.email',
  telefone: 'p.telefone',
  whatsapp: "COALESCE(NULLIF(p.whatsapp, ''), p.telefone)",
  cidade: `(SELECT e.cidade FROM pessoas_enderecos e WHERE e.pessoa_id = p.id ORDER BY e.principal DESC, e.id LIMIT 1)`,
  ultima_compra: `(SELECT DATE_FORMAT(MAX(pd.data_emissao), '%d/%m/%Y') FROM pedidos pd WHERE pd.pessoa_id = p.id AND pd.status <> 'cancelado')`,
  empresa: '(SELECT nome FROM empresas WHERE id = p.empresa_id)',
};

const RE_VARIAVEL = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/** Variáveis usadas no texto; erro se alguma não existir */
export function variaveisDoTexto(...textos: (string | null | undefined)[]): string[] {
  const usadas = new Set<string>();
  for (const t of textos) for (const m of String(t ?? '').matchAll(RE_VARIAVEL)) usadas.add(m[1].toLowerCase());
  const invalidas = [...usadas].filter((v) => !VARIAVEIS[v]);
  if (invalidas.length) {
    throw new Error(
      `Variável inexistente: ${invalidas.map((v) => `{{${v}}}`).join(', ')}. Disponíveis: ${Object.keys(VARIAVEIS)
        .map((v) => `{{${v}}}`)
        .join(', ')}.`,
    );
  }
  return [...usadas];
}

/** Troca as variáveis pelos dados da pessoa (as que faltam ficam em branco) */
export function personalizar(texto: string | null | undefined, dados: Record<string, any>): string {
  return String(texto ?? '').replace(RE_VARIAVEL, (_, v) => String(dados[v.toLowerCase()] ?? ''));
}

// ------------------------------------------------------------
// Rotas
// ------------------------------------------------------------

/** Pessoa sem o contato do canal não recebe: e-mail precisa de e-mail; SMS e WhatsApp, de telefone */
const CONTATO_DO_CANAL: Record<string, string> = {
  email: "AND p.email IS NOT NULL AND p.email <> ''",
  sms: "AND p.telefone IS NOT NULL AND p.telefone <> ''",
  whatsapp: "AND COALESCE(NULLIF(p.whatsapp, ''), p.telefone) <> ''",
};

export function createCampanhasRouter() {
  const router = Router();

  /** Regras disponíveis para o editor de critérios */
  router.get('/campanhas/regras', (_req: Request, res: Response) => {
    res.json(Object.entries(REGRAS).map(([regra, r]) => ({ regra, rotulo: r.rotulo, valor: r.valor })));
  });

  /** Recalcula o público do segmento */
  router.post('/campanhas/segmentos/:id/calcular', async (req: Request, res: Response) => {
    try {
      const total = await calcularSegmento(Number(req.params.id), res.locals.empresaId);
      res.json({ success: true, total });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, 'segmento') });
    }
  });

  /** Mensagem personalizada para as primeiras pessoas do público (sem gravar nada) */
  router.get('/campanhas/mensagens/:id/previa', async (req: Request, res: Response) => {
    try {
      const [msgs] = await pool.query<any[]>(
        `SELECT m.* FROM campanha_mensagens m JOIN campanhas c ON c.id = m.campanha_id
          WHERE m.id = ? AND c.empresa_id = ?`,
        [req.params.id, res.locals.empresaId],
      );
      if (!msgs.length) return res.status(404).json({ error: 'Mensagem não encontrada.' });
      const m = msgs[0];
      const colunas = Object.entries(VARIAVEIS).map(([k, sql]) => `${sql} AS ${k}`).join(', ');
      const [pessoas] = await pool.query<any[]>(
        `SELECT ${colunas} FROM pessoas p
          WHERE p.id IN (${publicoSql(m)})
          ORDER BY p.nome LIMIT 3`,
        [m.segmento_id ?? m.campanha_id],
      );
      res.json(pessoas.map((p) => ({ nome: p.nome, assunto: personalizar(m.assunto, p), corpo: personalizar(m.corpo, p) })));
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, 'mensagem') });
    }
  });

  /**
   * Gera os disparos: recalcula os segmentos da campanha e cria um disparo "pendente"
   * por pessoa para cada mensagem aprovada, agendado para agora + atraso da mensagem.
   * Pode ser repetido: quem já tem disparo daquela mensagem não ganha outro.
   */
  router.post('/campanhas/:id/disparos', async (req: Request, res: Response) => {
    const empresaId = res.locals.empresaId;
    const conn = await pool.getConnection();
    try {
      const [camps] = await conn.query<any[]>(
        'SELECT * FROM campanhas WHERE id = ? AND empresa_id = ? AND excluida_em IS NULL',
        [req.params.id, empresaId],
      );
      if (!camps.length) return res.status(404).json({ error: 'Campanha não encontrada.' });
      const c = camps[0];
      if (c.situacao === 'concluida' || c.situacao === 'cancelada') {
        return res.status(400).json({ error: `A campanha está ${c.situacao}: não gera mais disparos.` });
      }
      const [msgs] = await conn.query<any[]>("SELECT * FROM campanha_mensagens WHERE campanha_id = ? AND situacao = 'aprovada'", [c.id]);
      if (!msgs.length) return res.status(400).json({ error: 'Nenhuma mensagem aprovada nesta campanha.' });
      const [segs] = await conn.query<any[]>('SELECT id FROM campanha_segmentos WHERE campanha_id = ?', [c.id]);
      if (!segs.length) return res.status(400).json({ error: 'A campanha não tem segmentos.' });

      await conn.beginTransaction();
      for (const s of segs) await calcularSegmento(s.id, empresaId, conn);
      let gerados = 0;
      for (const m of msgs) {
        const [r] = await conn.query<any>(
          `INSERT IGNORE INTO disparos_mensagens (mensagem_id, pessoa_id, agendado_para)
           SELECT ?, p.id, NOW() + INTERVAL ? MINUTE FROM pessoas p
            WHERE p.id IN (${publicoSql(m)}) ${CONTATO_DO_CANAL[c.canal] || ''}`,
          [m.id, m.atraso_minutos, m.segmento_id ?? m.campanha_id],
        );
        gerados += r.affectedRows;
      }
      await conn.query(
        `UPDATE campanhas SET situacao = IF(situacao IN ('rascunho', 'agendada'), 'em_execucao', situacao),
                iniciada_em = COALESCE(iniciada_em, NOW()) WHERE id = ?`,
        [c.id],
      );
      await conn.commit();
      res.json({ success: true, gerados });
    } catch (err: any) {
      await conn.rollback().catch(() => {});
      res.status(400).json({ error: friendlyDbError(err, 'campanha') });
    } finally {
      conn.release();
    }
  });

  return router;
}

/** Subconsulta das pessoas do público da mensagem (um "?": segmento, ou a campanha quando a mensagem vale para todos) */
function publicoSql(m: { segmento_id: number | null }): string {
  return m.segmento_id
    ? 'SELECT sp.pessoa_id FROM campanha_segmento_pessoas sp WHERE sp.segmento_id = ?'
    : `SELECT sp.pessoa_id FROM campanha_segmento_pessoas sp
         JOIN campanha_segmentos s ON s.id = sp.segmento_id WHERE s.campanha_id = ?`;
}
