import { pool } from './db.js';
import { VARIAVEIS, personalizar } from './campanhas.js';
import { TIPOS_ATIVIDADE } from './schema.js';
import { ErroProvedor, enviarAutomatica, intervaloWhatsApp, telefoneWhatsApp } from './whatsapp.js';

/**
 * Mensagens automáticas do WhatsApp para o cliente, disparadas por eventos do CRM. Configuração
 * em Configurações › WhatsApp (tabela config, grupo "whatsapp", chave "automaticas"). Roda junto
 * com o envio das campanhas (a cada minuto), só das 8h às 20h. Cada aviso tem uma origem única
 * (ex.: "pedido:57:faturado") reservada antes do envio: nunca sai duas vezes.
 */

export interface ConfigAutomaticas {
  /**
   * Lembrete de atividade, X horas antes. Vai para quem a atividade manda (lembrete_para):
   * a pessoa (texto), o vendedor responsável do negócio (texto_vendedor), os dois ou ninguém
   */
  atividade: { ativo: boolean; horas: number; tipos: string[]; texto: string; texto_vendedor: string };
  /** Proposta enviada, X dias antes da validade */
  proposta: { ativo: boolean; dias: number; texto: string };
  /** Pedido que passou a aprovado/faturado depois de ligado (texto vazio = não avisa aquele status) */
  pedido: { ativo: boolean; aprovado: string; faturado: string; ativado_em?: string | null };
  /** Contrato ativo, X dias antes do fim */
  contrato: { ativo: boolean; dias: number; texto: string };
  /** Documento enviado para assinatura há X dias e ainda não assinado */
  assinatura: { ativo: boolean; dias: number; texto: string };
}

export const PADRAO: ConfigAutomaticas = {
  atividade: {
    ativo: false,
    horas: 24,
    tipos: ['reuniao', 'ligacao', 'almoco'],
    texto: 'Olá, {{primeiro_nome}}! Passando para lembrar: {{tipo}} "{{assunto}}" em {{data}} às {{hora}}. Até lá! — {{empresa}}',
    texto_vendedor: 'Lembrete: {{tipo}} "{{assunto}}" com {{nome}} ({{telefone_cliente}}) em {{data}} às {{hora}}.',
  },
  proposta: {
    ativo: false,
    dias: 2,
    texto: 'Olá, {{primeiro_nome}}! A proposta nº {{numero}} ({{titulo}}) vale até {{validade}}. Ficou alguma dúvida? Estamos à disposição. — {{empresa}}',
  },
  pedido: {
    ativo: false,
    aprovado: 'Olá, {{primeiro_nome}}! Seu pedido nº {{numero}} foi aprovado. Obrigado pela confiança! — {{empresa}}',
    faturado: 'Olá, {{primeiro_nome}}! Seu pedido nº {{numero}} foi faturado. — {{empresa}}',
    ativado_em: null,
  },
  contrato: {
    ativo: false,
    dias: 30,
    texto: 'Olá, {{primeiro_nome}}! O contrato nº {{numero}} ({{titulo}}) vence em {{fim}}. Vamos conversar sobre a renovação? — {{empresa}}',
  },
  assinatura: {
    ativo: false,
    dias: 2,
    texto: 'Olá, {{primeiro_nome}}! O contrato nº {{numero}} ({{titulo}}) está aguardando a sua assinatura. O link foi enviado por e-mail pela D4Sign. — {{empresa}}',
  },
};

/** Variáveis de cada evento (além das da pessoa); atividade_vendedor é o texto que vai para o vendedor */
const COMUNS = ['nome', 'primeiro_nome', 'empresa'];
type EventoTexto = keyof ConfigAutomaticas | 'atividade_vendedor';
export const VARIAVEIS_EVENTO: Record<EventoTexto, string[]> = {
  atividade: [...COMUNS, 'tipo', 'assunto', 'data', 'hora', 'vendedor'],
  atividade_vendedor: [...COMUNS, 'tipo', 'assunto', 'data', 'hora', 'vendedor', 'telefone_cliente'],
  proposta: [...COMUNS, 'numero', 'titulo', 'validade', 'valor'],
  pedido: [...COMUNS, 'numero', 'valor'],
  contrato: [...COMUNS, 'numero', 'titulo', 'fim'],
  assinatura: [...COMUNS, 'numero', 'titulo', 'documento'],
};

/** Data e hora de agora em Brasília, AAAA-MM-DD HH:MM:SS (o servidor pode estar em UTC) */
const agoraBrasilia = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());

const moeda = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Texto validado: não vazio (salvo onde vazio desliga), até 1.000 caracteres e só com as variáveis do evento */
function texto(valor: unknown, evento: EventoTexto, rotulo: string, podeVazio = false): string {
  const t = String(valor ?? '').trim();
  if (!t && !podeVazio) throw new Error(`Mensagens automáticas: escreva o texto de "${rotulo}".`);
  if (t.length > 1000) throw new Error(`Mensagens automáticas: o texto de "${rotulo}" passa de 1.000 caracteres.`);
  const invalidas = [...t.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()).filter((v) => !VARIAVEIS_EVENTO[evento].includes(v));
  if (invalidas.length) {
    throw new Error(
      `Mensagens automáticas: em "${rotulo}", ${[...new Set(invalidas)].map((v) => `{{${v}}}`).join(', ')} não existe. Use: ${VARIAVEIS_EVENTO[evento]
        .map((v) => `{{${v}}}`)
        .join(', ')}.`,
    );
  }
  return t;
}

function inteiro(valor: unknown, min: number, max: number, rotulo: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Mensagens automáticas: ${rotulo} deve ser de ${min} a ${max}.`);
  return n;
}

/** Configuração gravada completada com o padrão (evento novo aparece desligado) */
const completar = (cfg: any): ConfigAutomaticas =>
  Object.fromEntries(Object.entries(PADRAO).map(([k, padrao]) => [k, { ...padrao, ...(cfg?.[k] ?? {}) }])) as unknown as ConfigAutomaticas;

/** Valor que veio da tela → o que vai para o banco */
export function prepararAutomaticas(valor: any, anterior: any): ConfigAutomaticas {
  const v = completar(valor);
  const ant = completar(anterior);
  const tipos = (Array.isArray(v.atividade.tipos) ? v.atividade.tipos : []).map(String).filter((t) => TIPOS_ATIVIDADE.some((x) => x.value === t));
  if (v.atividade.ativo && !tipos.length) throw new Error('Mensagens automáticas: escolha ao menos um tipo de atividade para o lembrete.');
  const aprovado = texto(v.pedido.aprovado, 'pedido', 'Pedido aprovado', true);
  const faturado = texto(v.pedido.faturado, 'pedido', 'Pedido faturado', true);
  if (v.pedido.ativo && !aprovado && !faturado) throw new Error('Mensagens automáticas: escreva o texto de pedido aprovado ou de pedido faturado.');
  const pedidoAtivo = Boolean(v.pedido.ativo);
  return {
    atividade: {
      ativo: Boolean(v.atividade.ativo),
      horas: inteiro(v.atividade.horas, 1, 72, 'as horas antes da atividade'),
      tipos,
      texto: texto(v.atividade.texto, 'atividade', 'Lembrete de atividade — cliente'),
      texto_vendedor: texto(v.atividade.texto_vendedor, 'atividade_vendedor', 'Lembrete de atividade — vendedor'),
    },
    proposta: { ativo: Boolean(v.proposta.ativo), dias: inteiro(v.proposta.dias, 0, 60, 'os dias antes da validade da proposta'), texto: texto(v.proposta.texto, 'proposta', 'Proposta perto de vencer') },
    // Só pedidos alterados depois de ligar: ligar não dispara aviso de pedidos antigos
    pedido: { ativo: pedidoAtivo, aprovado, faturado, ativado_em: pedidoAtivo ? (ant.pedido.ativo && ant.pedido.ativado_em) || agoraBrasilia() : null },
    contrato: { ativo: Boolean(v.contrato.ativo), dias: inteiro(v.contrato.dias, 1, 180, 'os dias antes do fim do contrato'), texto: texto(v.contrato.texto, 'contrato', 'Contrato perto de vencer') },
    assinatura: { ativo: Boolean(v.assinatura.ativo), dias: inteiro(v.assinatura.dias, 1, 30, 'os dias sem assinatura'), texto: texto(v.assinatura.texto, 'assinatura', 'Assinatura pendente') },
  };
}

/** Valor do banco → a tela: completo, com as variáveis de cada evento */
export function automaticasPublica(cfg: any) {
  return { ...completar(cfg), variaveis: VARIAVEIS_EVENTO };
}

// ------------------------------------------------------------
// Quem deve receber agora
// ------------------------------------------------------------

/** Um aviso a enviar: a origem única, a pessoa, e os dados que preenchem o texto */
interface Aviso {
  origem: string;
  /** null: não é para a pessoa (o vendedor) */
  pessoa_id: number | null;
  telefone: string;
  texto: string;
}

// Montados na hora do uso: campanhas.ts e schema.ts entram num ciclo de importação
// (whatsapp → config → automaticas) e ainda não estão prontos quando este arquivo carrega

/** Colunas da pessoa (p) usadas pelas variáveis comuns */
// WhatsApp do cadastro principal; sem ele, o telefone
const daPessoa = () => `p.id AS pessoa_id, COALESCE(NULLIF(p.whatsapp, ''), p.telefone) AS telefone_destino, ${COMUNS.map((k) => `${VARIAVEIS[k]} AS ${k}`).join(', ')}`;
const COM_TELEFONE = "COALESCE(NULLIF(p.whatsapp, ''), p.telefone) <> ''";

/** Telefone para ler na mensagem: (47) 98848-9722; sem DDD fica como está no cadastro */
function telefoneLegivel(bruto: string | null): string {
  try {
    const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(telefoneWhatsApp(bruto));
    if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  } catch {
    // sem DDD ou inválido
  }
  return String(bruto ?? '');
}

const rotuloTipo = (tipo: string) => TIPOS_ATIVIDADE.find((t) => t.value === tipo)?.label.toLowerCase() ?? tipo;

/** Avisos devidos agora para a empresa, pelos eventos ligados */
// db: a conexão (o teste passa uma transação que é desfeita)
export async function avisosDevidos(empresaId: number, cfg: ConfigAutomaticas, db: Pick<typeof pool, 'query'> = pool): Promise<Aviso[]> {
  // para: outro destino que não a pessoa (o vendedor)
  const linhas: { origem: string; texto: string; dados: any; para?: { telefone: string; pessoa_id: null } }[] = [];

  if (cfg.atividade.ativo && cfg.atividade.tipos.length) {
    // Vendedor = responsável do negócio da atividade (ou do contrato), com WhatsApp no cadastro de usuários
    const [rows] = await db.query<any[]>(
      `SELECT a.id, a.assunto, a.tipo, a.lembrete_para, DATE_FORMAT(a.data_vencimento, '%d/%m/%Y') AS data, TIME_FORMAT(a.hora_vencimento, '%H:%i') AS hora,
              DATE_FORMAT(TIMESTAMP(a.data_vencimento, a.hora_vencimento), '%Y-%m-%d %H:%i') AS quando, ${daPessoa()},
              u.nome AS vendedor, u.telefone AS telefone_vendedor
         FROM atividades a
         LEFT JOIN pessoas p ON p.id = a.pessoa_id
         LEFT JOIN negocios n ON n.id = a.negocio_id
         LEFT JOIN contratos ct ON ct.id = a.contrato_id
         LEFT JOIN usuarios u ON u.id = COALESCE(n.proprietario_id, ct.proprietario_id) AND u.ativo = 1
        WHERE a.empresa_id = ? AND a.concluida = 0 AND a.hora_vencimento IS NOT NULL AND a.tipo IN (?) AND a.lembrete_para <> 'nenhum'
          AND TIMESTAMP(a.data_vencimento, a.hora_vencimento) BETWEEN NOW() AND NOW() + INTERVAL ? HOUR`,
      [empresaId, cfg.atividade.tipos, cfg.atividade.horas],
    );
    for (const r of rows) {
      const dados = { ...r, tipo: rotuloTipo(r.tipo), vendedor: r.vendedor ?? '', telefone_cliente: telefoneLegivel(r.telefone_destino) };
      // Remarcou: o horário novo ganha outro lembrete
      if (r.pessoa_id && r.lembrete_para !== 'vendedor') linhas.push({ origem: `atividade:${r.id}:${r.quando}`, texto: cfg.atividade.texto, dados });
      if (r.telefone_vendedor && r.lembrete_para !== 'cliente') {
        linhas.push({ origem: `atividade-vendedor:${r.id}:${r.quando}`, texto: cfg.atividade.texto_vendedor, dados, para: { telefone: r.telefone_vendedor, pessoa_id: null } });
      }
    }
  }

  if (cfg.proposta.ativo) {
    const [rows] = await db.query<any[]>(
      `SELECT pr.id, pr.numero_proposta AS numero, pr.titulo, pr.valor_total, DATE_FORMAT(pr.data_validade, '%d/%m/%Y') AS validade,
              DATE_FORMAT(pr.data_validade, '%Y-%m-%d') AS dv, ${daPessoa()}
         FROM propostas pr JOIN pessoas p ON p.id = pr.pessoa_id
        WHERE pr.empresa_id = ? AND pr.status = 'enviada' AND ${COM_TELEFONE}
          AND pr.data_validade BETWEEN CURDATE() AND CURDATE() + INTERVAL ? DAY`,
      [empresaId, cfg.proposta.dias],
    );
    for (const r of rows) linhas.push({ origem: `proposta:${r.id}:${r.dv}`, texto: cfg.proposta.texto, dados: { ...r, valor: moeda(r.valor_total) } });
  }

  if (cfg.pedido.ativo && cfg.pedido.ativado_em) {
    // ponytail: "alterado depois de ligar" pelo atualizado_em; um pedido antigo editado depois também avisa.
    // Histórico de status do pedido resolveria
    const [rows] = await db.query<any[]>(
      `SELECT pd.id, pd.numero_pedido AS numero, pd.status, pd.valor_total, ${daPessoa()}
         FROM pedidos pd JOIN pessoas p ON p.id = pd.pessoa_id
        WHERE pd.empresa_id = ? AND pd.status IN ('aprovado', 'faturado') AND ${COM_TELEFONE}
          AND pd.atualizado_em >= ? AND pd.atualizado_em >= NOW() - INTERVAL 2 DAY`,
      [empresaId, cfg.pedido.ativado_em],
    );
    for (const r of rows) {
      const t = r.status === 'aprovado' ? cfg.pedido.aprovado : cfg.pedido.faturado;
      if (t) linhas.push({ origem: `pedido:${r.id}:${r.status}`, texto: t, dados: { ...r, valor: moeda(r.valor_total) } });
    }
  }

  if (cfg.contrato.ativo) {
    const [rows] = await db.query<any[]>(
      `SELECT c.id, c.numero, c.titulo, DATE_FORMAT(c.data_fim, '%d/%m/%Y') AS fim, DATE_FORMAT(c.data_fim, '%Y-%m-%d') AS df, ${daPessoa()}
         FROM contratos c JOIN pessoas p ON p.id = c.pessoa_id
        WHERE c.empresa_id = ? AND c.situacao = 'ativo' AND ${COM_TELEFONE}
          AND c.data_fim BETWEEN CURDATE() AND CURDATE() + INTERVAL ? DAY`,
      [empresaId, cfg.contrato.dias],
    );
    // Renovou (fim novo): outro aviso no próximo vencimento
    for (const r of rows) linhas.push({ origem: `contrato:${r.id}:${r.df}`, texto: cfg.contrato.texto, dados: r });
  }

  if (cfg.assinatura.ativo) {
    const [rows] = await db.query<any[]>(
      `SELECT d.id, d.nome_arquivo AS documento, c.numero, c.titulo, ${daPessoa()}
         FROM contrato_documentos d JOIN contratos c ON c.id = d.contrato_id JOIN pessoas p ON p.id = c.pessoa_id
        WHERE c.empresa_id = ? AND d.assinatura_situacao IN ('enviado', 'visualizado') AND ${COM_TELEFONE}
          AND d.assinatura_enviada_em <= NOW() - INTERVAL ? DAY`,
      [empresaId, cfg.assinatura.dias],
    );
    for (const r of rows) linhas.push({ origem: `assinatura:${r.id}`, texto: cfg.assinatura.texto, dados: r });
  }

  const avisos: Aviso[] = [];
  for (const l of linhas) {
    let telefone: string;
    try {
      telefone = telefoneWhatsApp(l.para ? l.para.telefone : l.dados.telefone_destino);
    } catch {
      continue; // sem DDD ou inválido: não há como enviar
    }
    avisos.push({ origem: l.origem, pessoa_id: l.para ? null : l.dados.pessoa_id, telefone, texto: personalizar(l.texto, l.dados).trim() });
  }
  return avisos;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Fora da Vercel: um ciclo a cada minuto (na Vercel é o cron de /api/cron/whatsapp) */
export function iniciarAutomaticas() {
  let rodando = false;
  setInterval(async () => {
    if (rodando) return;
    rodando = true;
    try {
      const n = await enviarAutomaticas();
      if (n) console.log(`WhatsApp: ${n} mensagem(ns) automática(s) enviada(s).`);
    } catch (err: any) {
      console.error('WhatsApp automáticas: falha no ciclo:', err.message);
    } finally {
      rodando = false;
    }
  }, 60_000);
}

/**
 * Um ciclo: envia os avisos devidos de todas as empresas com algum evento ligado. prazoMs: tempo
 * máximo (na Vercel a função tem limite); o que não couber sai no próximo ciclo. Devolve quantos saíram.
 */
export async function enviarAutomaticas(prazoMs = Infinity): Promise<number> {
  const fim = Date.now() + prazoMs;
  const conn = await pool.getConnection();
  try {
    const [trava] = await conn.query<any[]>("SELECT GET_LOCK('crmweb_whatsapp_automaticas', 0) AS ok, HOUR(NOW()) AS hora");
    if (!trava[0]?.ok) return 0;
    try {
      // Só em horário comercial: nada de mensagem de madrugada
      if (trava[0].hora < 8 || trava[0].hora >= 20) return 0;
      const [cfgs] = await conn.query<any[]>("SELECT empresa_id, valor FROM config WHERE grupo = 'whatsapp' AND chave = 'automaticas' AND empresa_id IS NOT NULL");
      let enviados = 0;
      for (const linha of cfgs) {
        let cfg: ConfigAutomaticas;
        try {
          cfg = completar(JSON.parse(linha.valor));
        } catch {
          continue;
        }
        if (!Object.values(cfg).some((e) => e.ativo)) continue;
        try {
          const avisos = await avisosDevidos(linha.empresa_id, cfg);
          if (!avisos.length) continue;
          const intervalo = (await intervaloWhatsApp(linha.empresa_id)) * 1000;
          for (const a of avisos) {
            if (Date.now() + (enviados ? intervalo : 0) + 10_000 > fim) return enviados; // não cabe mais no prazo
            if (enviados) await esperar(intervalo);
            if (await enviarAutomatica(linha.empresa_id, a.origem, a.pessoa_id, a.telefone, a.texto)) enviados++;
          }
        } catch (err: any) {
          // Provedor fora do ar ou sem configuração: esta empresa fica para o próximo ciclo
          if (!(err instanceof ErroProvedor)) console.error(`WhatsApp automáticas: empresa ${linha.empresa_id}: ${err.message}`);
          else console.error(err.message);
        }
      }
      return enviados;
    } finally {
      await conn.query("SELECT RELEASE_LOCK('crmweb_whatsapp_automaticas')");
    }
  } finally {
    conn.release();
  }
}
