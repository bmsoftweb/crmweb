import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { podeAcessar } from './permissoes.js';
import { enviarWhatsApp, telefoneWhatsApp } from './whatsapp.js';

/**
 * Chamados de suporte (Suporte › Fila de Chamados e Chamados Ativos), no modelo do solweb:
 * aberto aguarda na fila, alguém assume, conversa (resposta ao cliente vai pelo WhatsApp da
 * pessoa; nota interna só a equipe vê), transfere e encerra. Tabelas chamados, chamado_mensagens
 * e chamado_categorias (SLA em horas). Assumir, transferir, encerrar e abrir entram na linha do
 * tempo como mensagens "sistema". Número sequencial por empresa.
 */

const ENCERRADOS = "('encerrado','cancelado')";

function erro(status: number, msg: string) {
  return Object.assign(new Error(msg), { status });
}

/** Fila ou Chamados Ativos: quem acessa uma das duas telas trabalha os chamados */
function exigirSuporte(res: Response) {
  const u = res.locals.usuario;
  if (!podeAcessar(u, 'chamados_fila') && !podeAcessar(u, 'chamados_ativos')) {
    throw erro(403, 'Você não tem permissão para acessar os chamados. Fale com o administrador.');
  }
}

const rota =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  async (req: Request, res: Response) => {
    try {
      exigirSuporte(res);
      await fn(req, res);
    } catch (err: any) {
      if (!err.status) console.error(`Chamados: ${err.message}`);
      res.status(err.status || 400).json({ error: err.message });
    }
  };

/** Colunas da lista/fila: cliente, categoria, atendente, espera e SLA */
const SELECT = `
  SELECT c.id, c.numero, c.titulo, c.status, c.prioridade, c.canal, c.pessoa_id, c.categoria_id, c.atendente_id, c.departamento_id,
         c.criado_em, c.assumido_em, c.encerrado_em, c.sla_prazo,
         COALESCE(p.nome, c.contato_nome) AS pessoa_nome, cat.nome AS categoria_nome, cat.cor AS categoria_cor, u.nome AS atendente_nome, d.nome AS departamento_nome,
         TIMESTAMPDIFF(MINUTE, c.criado_em, NOW()) AS espera_min,
         (c.sla_prazo IS NOT NULL AND c.sla_prazo < NOW() AND c.status NOT IN ${ENCERRADOS}) AS sla_vencido,
         (SELECT m.texto FROM chamado_mensagens m WHERE m.chamado_id = c.id AND m.autor <> 'sistema' ORDER BY m.id DESC LIMIT 1) AS ultima
    FROM chamados c
    LEFT JOIN pessoas p ON p.id = c.pessoa_id
    LEFT JOIN chamado_categorias cat ON cat.id = c.categoria_id
    LEFT JOIN usuarios u ON u.id = c.atendente_id
    LEFT JOIN departamentos d ON d.id = c.departamento_id`;

const numeros = (r: any) => ({ ...r, espera_min: Number(r.espera_min), sla_vencido: Boolean(Number(r.sla_vencido)) });

/** Linha "de sistema" na linha do tempo do chamado */
const evento = (chamadoId: number, usuarioId: number | null, texto: string) =>
  pool.query("INSERT INTO chamado_mensagens (chamado_id, usuario_id, autor, texto) VALUES (?, ?, 'sistema', ?)", [chamadoId, usuarioId, texto]);

async function chamadoDaEmpresa(id: string | number, emp: string) {
  const [r] = await pool.query<any[]>('SELECT * FROM chamados WHERE id = ? AND empresa_id = ?', [id, emp]);
  if (!r[0]) throw erro(404, 'Chamado não encontrado.');
  return r[0];
}

/** Só quem atende o chamado (ou o administrador) mexe nele; chamado sem atendente, qualquer um */
function conferirDono(c: any, res: Response) {
  const u = res.locals.usuario;
  if (c.atendente_id && Number(c.atendente_id) !== Number(res.locals.usuarioId) && u.tipo !== 'admin') {
    throw erro(403, 'Este chamado está com outro atendente. Só ele ou um administrador pode alterá-lo.');
  }
  if (['encerrado', 'cancelado'].includes(c.status)) throw erro(400, 'Chamado encerrado: não pode mais ser alterado.');
}

export function createChamadosRouter(): Router {
  const router = Router();
  const emp = (res: Response) => String(res.locals.empresaId);
  const eu = (res: Response) => Number(res.locals.usuarioId);

  /** Fila: aguardando, sem atendente, na ordem de chegada */
  router.get('/chamados/fila', rota(async (_req, res) => {
    const [r] = await pool.query<any[]>(
      `${SELECT} WHERE c.empresa_id = ? AND c.status = 'aguardando' AND c.atendente_id IS NULL ORDER BY c.criado_em, c.id`,
      [emp(res)],
    );
    res.json(r.map((x, i) => ({ ...numeros(x), posicao: i + 1 })));
  }));

  /** Chamados Ativos: filtro rápido (meus, todos, aguardando, andamento, encerrados) e busca */
  router.get('/chamados', rota(async (req, res) => {
    const filtro = String(req.query.filtro || 'meus');
    const onde: string[] = ['c.empresa_id = ?'];
    const params: any[] = [emp(res)];
    if (filtro === 'meus') {
      onde.push(`c.atendente_id = ? AND c.status NOT IN ${ENCERRADOS}`);
      params.push(eu(res));
    } else if (filtro === 'aguardando') onde.push("c.status = 'aguardando'");
    else if (filtro === 'andamento') onde.push("c.status IN ('em_andamento','pendente_cliente')");
    else if (filtro === 'encerrados') onde.push(`c.status IN ${ENCERRADOS}`);
    else onde.push(`c.status NOT IN ${ENCERRADOS}`);
    const q = String(req.query.q || '').trim();
    if (q) {
      onde.push('(c.titulo LIKE ? OR p.nome LIKE ? OR c.contato_nome LIKE ? OR c.numero = ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, Number(q) || 0);
    }
    const [r] = await pool.query<any[]>(
      `${SELECT} WHERE ${onde.join(' AND ')} ORDER BY ${filtro === 'encerrados' ? 'c.encerrado_em DESC' : 'c.criado_em DESC'}, c.id DESC LIMIT 200`,
      params,
    );
    res.json(r.map(numeros));
  }));

  /** Quantos na fila (etiqueta do menu) */
  router.get('/chamados/contagem', rota(async (_req, res) => {
    const [r] = await pool.query<any[]>("SELECT COUNT(*) n FROM chamados WHERE empresa_id = ? AND status = 'aguardando' AND atendente_id IS NULL", [emp(res)]);
    res.json({ fila: Number(r[0].n) });
  }));

  /** Busca de cliente para o Novo chamado (a lista de pessoas passa do limite dos combos) */
  router.get('/chamados/pessoas', rota(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const dig = q.replace(/\D/g, '');
    const [r] = await pool.query<any[]>(
      `SELECT id, nome, COALESCE(NULLIF(whatsapp, ''), telefone) AS telefone FROM pessoas
        WHERE empresa_id = ? AND (nome LIKE ? ${dig.length >= 4 ? 'OR cpf LIKE ? OR whatsapp LIKE ? OR telefone LIKE ?' : ''})
        ORDER BY nome LIMIT 20`,
      [emp(res), `%${q}%`, ...(dig.length >= 4 ? [`%${dig}%`, `%${dig}%`, `%${dig}%`] : [])],
    );
    res.json(r);
  }));

  /** Chamado aberto: dados, linha do tempo e o que o usuário pode fazer */
  router.get('/chamados/:id', rota(async (req, res) => {
    const [r] = await pool.query<any[]>(`${SELECT} WHERE c.id = ? AND c.empresa_id = ?`, [req.params.id, emp(res)]);
    if (!r[0]) throw erro(404, 'Chamado não encontrado.');
    const [extra] = await pool.query<any[]>(
      `SELECT c.descricao, a.nome AS aberto_por_nome, COALESCE(NULLIF(p.whatsapp, ''), p.telefone, c.contato_telefone) AS pessoa_telefone,
              c.contato_nome, c.contato_telefone, c.contato_documento
         FROM chamados c LEFT JOIN usuarios a ON a.id = c.aberto_por LEFT JOIN pessoas p ON p.id = c.pessoa_id WHERE c.id = ?`,
      [req.params.id],
    );
    const [mensagens] = await pool.query<any[]>(
      `SELECT m.id, m.autor, m.texto, m.interna, m.criado_em, m.usuario_id, u.nome AS usuario_nome
         FROM chamado_mensagens m LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE m.chamado_id = ? ORDER BY m.id`,
      [req.params.id],
    );
    const u = res.locals.usuario;
    res.json({
      ...numeros(r[0]),
      ...extra[0],
      eu_atendo: Number(r[0].atendente_id) === Number(res.locals.usuarioId),
      sou_admin: u.tipo === 'admin',
      mensagens: mensagens.map((m) => ({ ...m, interna: Boolean(m.interna) })),
    });
  }));

  /** Novo chamado (equipe): entra na fila, ou já fica com quem abriu */
  router.post('/chamados', rota(async (req, res) => {
    const b = req.body || {};
    const titulo = String(b.titulo ?? '').trim().slice(0, 200);
    if (!titulo) throw erro(400, 'Informe o título do chamado.');
    const prioridade = ['baixa', 'normal', 'alta', 'urgente'].includes(b.prioridade) ? b.prioridade : 'normal';
    const canal = ['interno', 'whatsapp', 'telefone', 'email', 'web'].includes(b.canal) ? b.canal : 'interno';
    const pessoaId = Number(b.pessoa_id) || null;
    const categoriaId = Number(b.categoria_id) || null;
    const atender = Boolean(b.atender);
    const conn = await pool.getConnection();
    let id: number;
    let numero: number;
    try {
      await conn.beginTransaction();
      if (pessoaId) {
        const [p] = await conn.query<any[]>('SELECT 1 FROM pessoas WHERE id = ? AND empresa_id = ?', [pessoaId, emp(res)]);
        if (!p.length) throw erro(400, 'Cliente não encontrado nesta empresa.');
      }
      let slaHoras: number | null = null;
      if (categoriaId) {
        const [cat] = await conn.query<any[]>('SELECT sla_horas FROM chamado_categorias WHERE id = ? AND empresa_id = ? AND ativo = 1', [categoriaId, emp(res)]);
        if (!cat.length) throw erro(400, 'Categoria não encontrada ou inativa.');
        slaHoras = Number(cat[0].sla_horas) || null;
      }
      const [[{ n }]] = await conn.query<any>('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM chamados WHERE empresa_id = ? FOR UPDATE', [emp(res)]);
      numero = Number(n);
      const [ins] = await conn.query<any>(
        `INSERT INTO chamados (empresa_id, numero, pessoa_id, categoria_id, titulo, descricao, status, prioridade, canal, atendente_id, aberto_por, sla_prazo, assumido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IS NULL, NULL, NOW() + INTERVAL ? HOUR), IF(?, NOW(), NULL))`,
        [emp(res), numero, pessoaId, categoriaId, titulo, String(b.descricao ?? '').trim() || null, atender ? 'em_andamento' : 'aguardando', prioridade, canal,
          atender ? eu(res) : null, eu(res), slaHoras, slaHoras ?? 0, atender],
      );
      id = Number(ins.insertId);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    const nome = res.locals.usuario.nome;
    await evento(id, eu(res), atender ? `Chamado aberto e assumido por ${nome}.` : `Chamado aberto por ${nome}. Aguardando na fila.`);
    res.json({ id, numero });
  }));

  /** Assumir: só chamado sem atendente (dois ao mesmo tempo: só um consegue) */
  router.post('/chamados/:id/assumir', rota(async (req, res) => {
    const c = await chamadoDaEmpresa(req.params.id, emp(res));
    if (['encerrado', 'cancelado'].includes(c.status)) throw erro(400, 'Chamado encerrado.');
    const [r] = await pool.query<any>(
      "UPDATE chamados SET atendente_id = ?, status = 'em_andamento', assumido_em = COALESCE(assumido_em, NOW()) WHERE id = ? AND atendente_id IS NULL",
      [eu(res), c.id],
    );
    if (!r.affectedRows) throw erro(409, 'Outro atendente já assumiu este chamado.');
    await evento(c.id, eu(res), `${res.locals.usuario.nome} assumiu o chamado.`);
    res.json({ success: true });
  }));

  /** Transferir para um usuário (fica com ele) ou para um departamento (volta para a fila) */
  router.post('/chamados/:id/transferir', rota(async (req, res) => {
    const c = await chamadoDaEmpresa(req.params.id, emp(res));
    conferirDono(c, res);
    const obs = String(req.body?.observacao ?? '').trim().slice(0, 500);
    const usuarioId = Number(req.body?.usuario_id) || null;
    const departamentoId = Number(req.body?.departamento_id) || null;
    let texto: string;
    if (usuarioId) {
      const [u] = await pool.query<any[]>('SELECT nome FROM usuarios WHERE id = ? AND empresa_id = ? AND ativo = 1', [usuarioId, emp(res)]);
      if (!u[0]) throw erro(400, 'Usuário de destino não encontrado ou inativo.');
      await pool.query("UPDATE chamados SET atendente_id = ?, status = 'em_andamento', assumido_em = COALESCE(assumido_em, NOW()) WHERE id = ?", [usuarioId, c.id]);
      texto = `Chamado transferido para ${u[0].nome} por ${res.locals.usuario.nome}.`;
    } else if (departamentoId) {
      const [d] = await pool.query<any[]>('SELECT nome FROM departamentos WHERE id = ? AND empresa_id = ?', [departamentoId, emp(res)]);
      if (!d[0]) throw erro(400, 'Departamento não encontrado.');
      await pool.query("UPDATE chamados SET atendente_id = NULL, departamento_id = ?, status = 'aguardando' WHERE id = ?", [departamentoId, c.id]);
      texto = `Chamado transferido para o departamento ${d[0].nome} por ${res.locals.usuario.nome}. Voltou para a fila.`;
    } else throw erro(400, 'Escolha o usuário ou o departamento de destino.');
    await evento(c.id, eu(res), obs ? `${texto} Obs.: ${obs}` : texto);
    res.json({ success: true });
  }));

  router.post('/chamados/:id/encerrar', rota(async (req, res) => {
    const c = await chamadoDaEmpresa(req.params.id, emp(res));
    conferirDono(c, res);
    await pool.query("UPDATE chamados SET status = 'encerrado', encerrado_em = NOW() WHERE id = ?", [c.id]);
    await evento(c.id, eu(res), `Chamado encerrado por ${res.locals.usuario.nome}.`);
    res.json({ success: true });
  }));

  /** Resposta ao cliente (vai pelo WhatsApp da pessoa, se tiver) ou nota interna (só a equipe vê) */
  router.post('/chamados/:id/mensagens', rota(async (req, res) => {
    const c = await chamadoDaEmpresa(req.params.id, emp(res));
    conferirDono(c, res);
    if (!c.atendente_id) throw erro(400, 'Assuma o chamado antes de responder.');
    const texto = String(req.body?.texto ?? '').trim().slice(0, 4000);
    if (!texto) throw erro(400, 'Escreva a mensagem.');
    const interna = Boolean(req.body?.interna);
    let whatsappId: number | null = null;
    let aviso: string | null = null;
    // Chamado do site: o cliente lê a resposta no chat do site (não vai WhatsApp)
    if (!interna && c.canal !== 'web') {
      const [p] = c.pessoa_id
        ? await pool.query<any[]>("SELECT COALESCE(NULLIF(whatsapp, ''), telefone) AS tel FROM pessoas WHERE id = ?", [c.pessoa_id])
        : [[]];
      const tel = p[0]?.tel;
      if (!tel) aviso = 'O cliente não tem WhatsApp no cadastro: a resposta ficou só no chamado.';
      else {
        const numero = telefoneWhatsApp(tel);
        await enviarWhatsApp(emp(res), numero, texto, { pessoa_id: c.pessoa_id, usuario_id: eu(res) }, res.locals.usuario.nome);
        const [w] = await pool.query<any[]>(
          "SELECT MAX(id) id FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ? AND direcao = 'enviada' AND usuario_id = ?",
          [emp(res), numero, eu(res)],
        );
        whatsappId = w[0]?.id ?? null;
      }
    }
    await pool.query("INSERT INTO chamado_mensagens (chamado_id, usuario_id, autor, texto, interna, whatsapp_id) VALUES (?, ?, 'equipe', ?, ?, ?)", [
      c.id,
      eu(res),
      texto,
      interna ? 1 : 0,
      whatsappId,
    ]);
    res.json({ success: true, aviso });
  }));

  return router;
}
