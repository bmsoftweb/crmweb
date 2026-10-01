import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { podeAcessar } from './permissoes.js';

/**
 * Painel de Suporte (Suporte › Painel de Suporte): indicadores dos chamados, dos atendimentos do WhatsApp e das
 * avaliações num período, comparados com o período anterior equivalente. Só leitura.
 */

const ID_TELA = 'painel_suporte';

export type ChavePeriodo = '7d' | '30d' | 'mes' | 'mes_anterior' | '90d' | 'ano';
export const PERIODOS: ChavePeriodo[] = ['7d', '30d', 'mes', 'mes_anterior', '90d', 'ano'];

interface Faixa {
  de: string; // AAAA-MM-DD, inclusive
  ate: string; // AAAA-MM-DD, inclusive
}

// Datas como texto, contas em UTC só como calculadora (sem fuso)
const d2 = (n: number) => String(n).padStart(2, '0');
const txt = (x: Date) => `${x.getUTCFullYear()}-${d2(x.getUTCMonth() + 1)}-${d2(x.getUTCDate())}`;
const data = (s: string) => new Date(`${s}T00:00:00Z`);
const somar = (s: string, dias: number) => txt(new Date(data(s).getTime() + dias * 86_400_000));
const dias = (f: Faixa) => Math.round((data(f.ate).getTime() - data(f.de).getTime()) / 86_400_000) + 1;
/** Mesmo dia em outro mês, sem passar do fim dele (31/03 - 1 mês = 28/02) */
function mudarMes(s: string, meses: number) {
  const x = data(s);
  const alvo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + meses, 1));
  const fim = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(x.getUTCDate(), fim));
  return txt(alvo);
}

/** Período escolhido e o anterior equivalente (mês: o mesmo trecho do mês anterior; ano: o mesmo trecho do ano anterior) */
export function periodos(chave: ChavePeriodo, hoje: string): { atual: Faixa; anterior: Faixa } {
  const ultimos = (n: number) => {
    const atual = { de: somar(hoje, -(n - 1)), ate: hoje };
    return { atual, anterior: { de: somar(atual.de, -n), ate: somar(atual.de, -1) } };
  };
  const inicioMes = `${hoje.slice(0, 8)}01`;
  switch (chave) {
    case '7d':
      return ultimos(7);
    case '90d':
      return ultimos(90);
    case 'mes':
      return { atual: { de: inicioMes, ate: hoje }, anterior: { de: mudarMes(inicioMes, -1), ate: mudarMes(hoje, -1) } };
    case 'mes_anterior': {
      const de = mudarMes(inicioMes, -1);
      const antes = mudarMes(inicioMes, -2);
      return { atual: { de, ate: somar(inicioMes, -1) }, anterior: { de: antes, ate: somar(de, -1) } };
    }
    case 'ano': {
      const de = `${hoje.slice(0, 4)}-01-01`;
      return { atual: { de, ate: hoje }, anterior: { de: mudarMes(de, -12), ate: mudarMes(hoje, -12) } };
    }
    default:
      return ultimos(30);
  }
}

/** Intervalo para comparar com DATETIME: [de 00:00, dia seguinte ao ate 00:00) */
const intervalo = (f: Faixa) => [`${f.de} 00:00:00`, `${somar(f.ate, 1)} 00:00:00`];

/** Indicadores que existem nos dois períodos (atual e anterior) */
async function resumo(empresa: string, f: Faixa) {
  const [a, b] = intervalo(f);
  const [[ch]] = await pool.query<any[]>(
    `SELECT SUM(c.criado_em >= ? AND c.criado_em < ?) AS abertos,
            SUM(c.status = 'encerrado' AND c.encerrado_em >= ? AND c.encerrado_em < ?) AS encerrados,
            AVG(CASE WHEN c.criado_em >= ? AND c.criado_em < ? AND c.assumido_em IS NOT NULL
                     THEN TIMESTAMPDIFF(MINUTE, c.criado_em, c.assumido_em) END) AS min_assumir,
            AVG(CASE WHEN c.status = 'encerrado' AND c.encerrado_em >= ? AND c.encerrado_em < ?
                     THEN TIMESTAMPDIFF(MINUTE, c.criado_em, c.encerrado_em) END) AS min_resolver,
            SUM(c.status = 'encerrado' AND c.encerrado_em >= ? AND c.encerrado_em < ? AND c.sla_prazo IS NOT NULL) AS sla_total,
            SUM(c.status = 'encerrado' AND c.encerrado_em >= ? AND c.encerrado_em < ? AND c.sla_prazo IS NOT NULL AND c.encerrado_em <= c.sla_prazo) AS sla_ok
       FROM chamados c WHERE c.empresa_id = ?`,
    [a, b, a, b, a, b, a, b, a, b, a, b, empresa],
  );
  const [[wa]] = await pool.query<any[]>(
    `SELECT COUNT(*) AS total, SUM(atendente_id IS NULL) AS so_bot,
            AVG(CASE WHEN inicio IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, inicio, fim) END) AS min_duracao
       FROM whatsapp_atendimentos WHERE empresa_id = ? AND fim >= ? AND fim < ?`,
    [empresa, a, b],
  );
  const [[av]] = await pool.query<any[]>(
    `SELECT SUM(situacao = 'respondida' AND respondida_em >= ? AND respondida_em < ?) AS respondidas,
            AVG(CASE WHEN situacao = 'respondida' AND respondida_em >= ? AND respondida_em < ? THEN nota END) AS media,
            SUM(pedida_em >= ? AND pedida_em < ?) AS pedidas,
            SUM(pedida_em >= ? AND pedida_em < ? AND situacao = 'respondida') AS respondidas_das_pedidas
       FROM avaliacoes WHERE empresa_id = ?`,
    [a, b, a, b, a, b, a, b, empresa],
  );
  const n = (v: any) => (v == null ? null : Number(v));
  return {
    chamados: {
      abertos: n(ch.abertos) ?? 0,
      encerrados: n(ch.encerrados) ?? 0,
      min_assumir: n(ch.min_assumir),
      min_resolver: n(ch.min_resolver),
      sla_pct: Number(ch.sla_total) ? (Number(ch.sla_ok) / Number(ch.sla_total)) * 100 : null,
    },
    whatsapp: {
      total: n(wa.total) ?? 0,
      so_bot_pct: Number(wa.total) ? (Number(wa.so_bot) / Number(wa.total)) * 100 : null,
      min_duracao: n(wa.min_duracao),
    },
    satisfacao: {
      respondidas: n(av.respondidas) ?? 0,
      media: n(av.media),
      resposta_pct: Number(av.pedidas) ? (Number(av.respondidas_das_pedidas) / Number(av.pedidas)) * 100 : null,
    },
  };
}

/** Domingo da semana de uma data (as semanas começam no domingo, como no calendário) */
const domingo = (s: string) => somar(s, -data(s).getUTCDay());

/** Unidade da série: até 45 dias por dia, até 92 por semana, além disso por mês (os rótulos do eixo cabem todos) */
export function unidadeSerie(f: Faixa): 'dia' | 'semana' | 'mes' {
  const n = dias(f);
  return n > 92 ? 'mes' : n > 45 ? 'semana' : 'dia';
}

/** Série por dia, semana ou mês, com os intervalos sem movimento zerados */
async function serie(empresa: string, f: Faixa) {
  const [a, b] = intervalo(f);
  const unidade = unidadeSerie(f);
  // Chave de cada registro: AAAA-MM-DD do dia, AAAA-MM-DD do domingo da semana, ou AAAA-MM
  const chave = (col: string) =>
    unidade === 'mes'
      ? `DATE_FORMAT(${col}, '%Y-%m')`
      : unidade === 'semana'
      ? `DATE_FORMAT(DATE_SUB(DATE(${col}), INTERVAL DAYOFWEEK(${col}) - 1 DAY), '%Y-%m-%d')`
      : `DATE_FORMAT(${col}, '%Y-%m-%d')`;
  const contar = async (sql: string) => {
    const [r] = await pool.query<any[]>(sql, [empresa, a, b]);
    return new Map(r.map((x) => [x.k, Number(x.n)]));
  };
  const [abertos, encerrados, whats] = await Promise.all([
    contar(`SELECT ${chave('criado_em')} AS k, COUNT(*) AS n FROM chamados WHERE empresa_id = ? AND criado_em >= ? AND criado_em < ? GROUP BY k`),
    contar(
      `SELECT ${chave('encerrado_em')} AS k, COUNT(*) AS n FROM chamados WHERE empresa_id = ? AND status = 'encerrado' AND encerrado_em >= ? AND encerrado_em < ? GROUP BY k`,
    ),
    contar(`SELECT ${chave('fim')} AS k, COUNT(*) AS n FROM whatsapp_atendimentos WHERE empresa_id = ? AND fim >= ? AND fim < ? GROUP BY k`),
  ]);
  const chaves: string[] = [];
  if (unidade === 'mes') for (let m = f.de.slice(0, 7); m <= f.ate.slice(0, 7); m = mudarMes(`${m}-01`, 1).slice(0, 7)) chaves.push(m);
  else if (unidade === 'semana') for (let d = domingo(f.de); d <= f.ate; d = somar(d, 7)) chaves.push(d);
  else for (let d = f.de; d <= f.ate; d = somar(d, 1)) chaves.push(d);
  return {
    unidade,
    pontos: chaves.map((k) => ({ k, abertos: abertos.get(k) ?? 0, encerrados: encerrados.get(k) ?? 0, whatsapp: whats.get(k) ?? 0 })),
  };
}

export function createPainelSuporteRouter(): Router {
  const router = Router();

  router.get('/suporte/painel', async (req: Request, res: Response) => {
    try {
      if (!podeAcessar(res.locals.usuario, ID_TELA)) {
        throw Object.assign(new Error('Você não tem permissão para acessar o Painel de Suporte. Fale com o administrador.'), { status: 403 });
      }
      const empresa = String(res.locals.empresaId);
      const chave = (PERIODOS.includes(req.query.periodo as ChavePeriodo) ? req.query.periodo : '30d') as ChavePeriodo;
      const [[{ hoje }]] = await pool.query<any[]>("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoje");
      const p = periodos(chave, hoje);
      const [a, b] = intervalo(p.atual);

      const [atual, anterior, linhaTempo] = await Promise.all([resumo(empresa, p.atual), resumo(empresa, p.anterior), serie(empresa, p.atual)]);

      // Situação agora (não depende do período)
      const [[agora]] = await pool.query<any[]>(
        `SELECT SUM(status NOT IN ('encerrado','cancelado')) AS em_aberto,
                SUM(status = 'aguardando' AND atendente_id IS NULL) AS na_fila,
                SUM(status NOT IN ('encerrado','cancelado') AND sla_prazo IS NOT NULL AND sla_prazo < NOW()) AS sla_estourado,
                SUM(status = 'pendente_cliente') AS pendente_cliente,
                SUM(status = 'pausado') AS pausados
           FROM chamados WHERE empresa_id = ?`,
        [empresa],
      );

      const contagem = async (sql: string, params: any[]) => {
        const [r] = await pool.query<any[]>(sql, params);
        return r.map((x) => ({ nome: String(x.nome ?? '—'), qtd: Number(x.qtd), ...(x.extra != null ? { extra: Number(x.extra) } : {}) }));
      };
      const [canais, categorias, prioridades, departamentos, motivos, notas, mapa, clientes] = await Promise.all([
        contagem(`SELECT canal AS nome, COUNT(*) AS qtd FROM chamados WHERE empresa_id = ? AND criado_em >= ? AND criado_em < ? GROUP BY canal ORDER BY qtd DESC`, [empresa, a, b]),
        // extra = tempo médio de resolução (min) dos encerrados da categoria
        contagem(
          `SELECT COALESCE(cc.nome, 'Sem categoria') AS nome, COUNT(*) AS qtd,
                  AVG(CASE WHEN c.status = 'encerrado' THEN TIMESTAMPDIFF(MINUTE, c.criado_em, c.encerrado_em) END) AS extra
             FROM chamados c LEFT JOIN chamado_categorias cc ON cc.id = c.categoria_id
            WHERE c.empresa_id = ? AND c.criado_em >= ? AND c.criado_em < ? GROUP BY nome ORDER BY qtd DESC`,
          [empresa, a, b],
        ),
        contagem(
          `SELECT prioridade AS nome, COUNT(*) AS qtd FROM chamados WHERE empresa_id = ? AND criado_em >= ? AND criado_em < ?
            GROUP BY prioridade ORDER BY FIELD(prioridade, 'urgente', 'alta', 'normal', 'baixa')`,
          [empresa, a, b],
        ),
        contagem(
          `SELECT COALESCE(d.nome, 'Sem departamento') AS nome, COUNT(*) AS qtd FROM whatsapp_atendimentos w LEFT JOIN departamentos d ON d.id = w.departamento_id
            WHERE w.empresa_id = ? AND w.fim >= ? AND w.fim < ? GROUP BY nome ORDER BY qtd DESC`,
          [empresa, a, b],
        ),
        contagem(`SELECT COALESCE(motivo_fim, 'outro') AS nome, COUNT(*) AS qtd FROM whatsapp_atendimentos WHERE empresa_id = ? AND fim >= ? AND fim < ? GROUP BY nome ORDER BY qtd DESC`, [
          empresa,
          a,
          b,
        ]),
        contagem(
          `SELECT nota AS nome, COUNT(*) AS qtd FROM avaliacoes WHERE empresa_id = ? AND situacao = 'respondida' AND nota IS NOT NULL
              AND respondida_em >= ? AND respondida_em < ? GROUP BY nota ORDER BY nota DESC`,
          [empresa, a, b],
        ),
        // Volume por dia da semana (1 = domingo) e hora: chamados abertos + atendimentos do WhatsApp
        pool
          .query<any[]>(
            `SELECT dia, hora, SUM(n) AS n FROM (
               SELECT DAYOFWEEK(criado_em) AS dia, HOUR(criado_em) AS hora, COUNT(*) AS n FROM chamados WHERE empresa_id = ? AND criado_em >= ? AND criado_em < ? GROUP BY dia, hora
               UNION ALL
               SELECT DAYOFWEEK(COALESCE(inicio, fim)), HOUR(COALESCE(inicio, fim)), COUNT(*) FROM whatsapp_atendimentos WHERE empresa_id = ? AND fim >= ? AND fim < ? GROUP BY 1, 2
             ) x GROUP BY dia, hora`,
            [empresa, a, b, empresa, a, b],
          )
          .then(([r]) => r.map((x) => ({ dia: Number(x.dia), hora: Number(x.hora), n: Number(x.n) }))),
        contagem(
          `SELECT COALESCE(p.nome, c.contato_nome, 'Sem cliente') AS nome, COUNT(*) AS qtd FROM chamados c LEFT JOIN pessoas p ON p.id = c.pessoa_id
            WHERE c.empresa_id = ? AND c.criado_em >= ? AND c.criado_em < ? GROUP BY nome ORDER BY qtd DESC LIMIT 5`,
          [empresa, a, b],
        ),
      ]);

      // Por técnico: chamados encerrados (e tempo médio), atendimentos do WhatsApp e nota média recebida
      const [enc] = await pool.query<any[]>(
        `SELECT atendente_id AS id, COUNT(*) AS encerrados, AVG(TIMESTAMPDIFF(MINUTE, criado_em, encerrado_em)) AS min_resolver
           FROM chamados WHERE empresa_id = ? AND status = 'encerrado' AND encerrado_em >= ? AND encerrado_em < ? AND atendente_id IS NOT NULL GROUP BY atendente_id`,
        [empresa, a, b],
      );
      const [wpp] = await pool.query<any[]>(
        `SELECT atendente_id AS id, COUNT(*) AS whatsapp FROM whatsapp_atendimentos WHERE empresa_id = ? AND fim >= ? AND fim < ? AND atendente_id IS NOT NULL GROUP BY atendente_id`,
        [empresa, a, b],
      );
      const [avs] = await pool.query<any[]>(
        `SELECT atendente_id AS id, AVG(nota) AS media, COUNT(*) AS avaliacoes FROM avaliacoes
          WHERE empresa_id = ? AND situacao = 'respondida' AND nota IS NOT NULL AND respondida_em >= ? AND respondida_em < ? AND atendente_id IS NOT NULL GROUP BY atendente_id`,
        [empresa, a, b],
      );
      const ids = [...new Set([...enc, ...wpp, ...avs].map((x) => Number(x.id)))];
      const [nomes] = ids.length ? await pool.query<any[]>('SELECT id, nome FROM usuarios WHERE id IN (?)', [ids]) : [[] as any[]];
      const tecnicos = ids
        .map((id) => {
          const e = enc.find((x) => Number(x.id) === id);
          const w = wpp.find((x) => Number(x.id) === id);
          const v = avs.find((x) => Number(x.id) === id);
          return {
            id,
            nome: nomes.find((u: any) => Number(u.id) === id)?.nome ?? `#${id}`,
            encerrados: Number(e?.encerrados ?? 0),
            min_resolver: e?.min_resolver != null ? Number(e.min_resolver) : null,
            whatsapp: Number(w?.whatsapp ?? 0),
            media: v?.media != null ? Number(v.media) : null,
            avaliacoes: Number(v?.avaliacoes ?? 0),
          };
        })
        .sort((x, y) => y.encerrados + y.whatsapp - (x.encerrados + x.whatsapp));

      res.json({
        periodo: { chave, ...p },
        atual,
        anterior,
        agora: Object.fromEntries(Object.entries(agora).map(([k, v]) => [k, Number(v ?? 0)])),
        serie: linhaTempo,
        canais,
        categorias,
        prioridades,
        departamentos,
        motivos,
        notas,
        mapa,
        clientes,
        tecnicos,
      });
    } catch (err: any) {
      if (!err.status) console.error(`Painel de Suporte: ${err.message}`);
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return router;
}
