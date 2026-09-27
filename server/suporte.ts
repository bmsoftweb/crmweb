import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { pool } from './db.js';

/**
 * Suporte pelo site (widget público, sem login): public/widget.js abre a página /suporte?e=<empresa>,
 * onde o cliente abre um chamado (CNPJ/CPF, nome, WhatsApp, categoria e descrição) e conversa com a
 * equipe. O chamado cai na Fila de Chamados (server/chamados.ts) com canal "web".
 *
 * O CNPJ só serve para ligar o chamado à Pessoa do CRM: ver o chamado e as mensagens exige o token
 * assinado que só o navegador que abriu recebe (quem digita o CNPJ de outra empresa não vê nada dela).
 * O cliente não vê notas internas nem os eventos da equipe; vê a posição na fila e quem atende.
 */

// Sem SESSION_SECRET, um segredo aleatório (os links valem até o servidor reiniciar)
const SEGREDO = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function erro(status: number, msg: string) {
  return Object.assign(new Error(msg), { status });
}

/** Token do chamado para o navegador do cliente: "<id>.<assinatura>" */
export function tokenSuporte(chamadoId: number): string {
  const ass = crypto.createHmac('sha256', SEGREDO).update(`suporte:${chamadoId}`).digest('base64url').slice(0, 32);
  return `${chamadoId}.${ass}`;
}

/** Id do chamado do token, ou null se a assinatura não bate */
export function chamadoDoToken(token: string): number | null {
  const [id] = String(token || '').split('.');
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return null;
  const esperado = tokenSuporte(n);
  return esperado.length === token.length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(token)) ? n : null;
}

const digitos = (v: unknown, max: number) => String(v ?? '').replace(/\D/g, '').slice(0, max);
const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export function createSuporteRouter(): Router {
  const router = Router();
  const rota =
    (fn: (req: Request, res: Response) => Promise<any>) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (err: any) {
        if (!err.status) console.error(`Suporte (site): ${err.message}`);
        res.status(err.status || 500).json({ error: err.status ? err.message : 'Não foi possível concluir agora. Tente de novo em instantes.' });
      }
    };

  /** Chamado do token (e da empresa dele) */
  async function doToken(token: string) {
    const id = chamadoDoToken(token);
    if (!id) throw erro(404, 'Atendimento não encontrado.');
    const [r] = await pool.query<any[]>(
      `SELECT c.id, c.empresa_id, c.numero, c.titulo, c.status, c.pessoa_id, c.atendente_id, c.departamento_id, c.criado_em, c.contato_telefone,
              u.nome AS atendente_nome,
              (SELECT COUNT(*) FROM chamados f WHERE f.empresa_id = c.empresa_id AND f.status = 'aguardando' AND f.atendente_id IS NULL
                  AND (f.criado_em < c.criado_em OR (f.criado_em = c.criado_em AND f.id < c.id))) + 1 AS posicao,
              EXISTS (SELECT 1 FROM chamado_mensagens m WHERE m.chamado_id = c.id AND m.autor = 'sistema' AND m.texto LIKE 'Cliente avaliou%') AS avaliado
         FROM chamados c LEFT JOIN usuarios u ON u.id = c.atendente_id WHERE c.id = ?`,
      [id],
    );
    if (!r[0]) throw erro(404, 'Atendimento não encontrado.');
    return r[0];
  }

  /** Empresa e categorias, para montar o formulário */
  router.get('/api/publico/suporte/:empresa', rota(async (req, res) => {
    const [e] = await pool.query<any[]>('SELECT id, nome, logo FROM empresas WHERE id = ?', [Number(req.params.empresa) || 0]);
    if (!e[0]) throw erro(404, 'Suporte não encontrado.');
    const [cats] = await pool.query<any[]>('SELECT id, nome FROM chamado_categorias WHERE empresa_id = ? AND ativo = 1 ORDER BY nome', [e[0].id]);
    res.json({ empresa: { nome: e[0].nome, logo: e[0].logo }, categorias: cats });
  }));

  /** Abre o chamado; devolve o token que dá acesso a ele */
  router.post('/api/publico/suporte/:empresa/chamados', rota(async (req, res) => {
    const empresaId = Number(req.params.empresa) || 0;
    const [e] = await pool.query<any[]>('SELECT id FROM empresas WHERE id = ?', [empresaId]);
    if (!e[0]) throw erro(404, 'Suporte não encontrado.');
    const b = req.body || {};
    const documento = digitos(b.documento, 14);
    const nome = texto(b.nome, 120);
    const telefone = digitos(b.telefone, 20);
    const descricao = texto(b.descricao, 4000);
    if (documento.length !== 11 && documento.length !== 14) throw erro(400, 'Informe o CNPJ (ou CPF) da empresa.');
    if (nome.length < 2) throw erro(400, 'Informe o seu nome.');
    if (telefone.length < 10) throw erro(400, 'Informe o seu WhatsApp com DDD.');
    if (descricao.length < 5) throw erro(400, 'Conte o que está acontecendo.');
    const titulo = texto(b.titulo, 200) || descricao.split('\n')[0].slice(0, 80);
    let categoriaId: number | null = Number(b.categoria_id) || null;
    let slaHoras: number | null = null;
    if (categoriaId) {
      const [cat] = await pool.query<any[]>('SELECT sla_horas FROM chamado_categorias WHERE id = ? AND empresa_id = ? AND ativo = 1', [categoriaId, empresaId]);
      if (!cat[0]) categoriaId = null;
      else slaHoras = Number(cat[0].sla_horas) || null;
    }
    // Cliente do CRM pelo CNPJ/CPF (sem ele, o chamado fica com o nome e o WhatsApp de quem abriu)
    const [p] = await pool.query<any[]>('SELECT id FROM pessoas WHERE empresa_id = ? AND cpf = ? ORDER BY id LIMIT 1', [empresaId, documento]);
    const pessoaId = p[0]?.id ?? null;

    const conn = await pool.getConnection();
    let id: number;
    let numero: number;
    try {
      await conn.beginTransaction();
      const [[{ n }]] = await conn.query<any>('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM chamados WHERE empresa_id = ? FOR UPDATE', [empresaId]);
      numero = Number(n);
      const [ins] = await conn.query<any>(
        `INSERT INTO chamados (empresa_id, numero, pessoa_id, categoria_id, titulo, descricao, status, prioridade, canal,
                               contato_nome, contato_telefone, contato_documento, sla_prazo)
         VALUES (?, ?, ?, ?, ?, ?, 'aguardando', 'normal', 'web', ?, ?, ?, IF(? IS NULL, NULL, NOW() + INTERVAL ? HOUR))`,
        [empresaId, numero, pessoaId, categoriaId, titulo, descricao, nome, telefone, documento, slaHoras, slaHoras ?? 0],
      );
      id = Number(ins.insertId);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await pool.query("INSERT INTO chamado_mensagens (chamado_id, autor, texto) VALUES (?, 'sistema', ?)", [
      id,
      `Chamado aberto pelo cliente no site: ${nome}, WhatsApp ${telefone}${pessoaId ? '' : ` (CNPJ/CPF ${documento} não está no CRM)`}.`,
    ]);
    res.json({ token: tokenSuporte(id), numero });
  }));

  /** Situação e conversa (sem notas internas nem eventos da equipe) */
  router.get('/api/publico/suporte/chamado/:token', rota(async (req, res) => {
    const c = await doToken(req.params.token);
    const [msgs] = await pool.query<any[]>(
      `SELECT m.id, m.autor, m.texto, m.criado_em, u.nome AS usuario_nome
         FROM chamado_mensagens m LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.chamado_id = ? AND m.autor IN ('cliente','equipe') AND m.interna = 0 ORDER BY m.id`,
      [c.id],
    );
    const aguardando = c.status === 'aguardando' && !c.atendente_id;
    res.json({
      numero: c.numero,
      titulo: c.titulo,
      status: c.status,
      atendente: c.atendente_nome ?? null,
      posicao: aguardando ? Number(c.posicao) : null,
      avaliado: Boolean(Number(c.avaliado)),
      mensagens: msgs,
    });
  }));

  router.post('/api/publico/suporte/chamado/:token/mensagens', rota(async (req, res) => {
    const c = await doToken(req.params.token);
    if (['encerrado', 'cancelado'].includes(c.status)) throw erro(409, 'Este atendimento foi encerrado. Abra um novo, se precisar.');
    const msg = texto(req.body?.texto, 4000);
    if (!msg) throw erro(400, 'Escreva a mensagem.');
    await pool.query("INSERT INTO chamado_mensagens (chamado_id, autor, texto) VALUES (?, 'cliente', ?)", [c.id, msg]);
    res.json({ success: true });
  }));

  /**
   * Cliente encerra pelo chat: com atendente, o chamado fica encerrado (e o cliente avalia); sem
   * ninguém ter assumido, fica cancelado (desistiu da fila)
   */
  router.post('/api/publico/suporte/chamado/:token/encerrar', rota(async (req, res) => {
    const c = await doToken(req.params.token);
    if (['encerrado', 'cancelado'].includes(c.status)) throw erro(409, 'Este atendimento já foi encerrado.');
    const cancelar = !c.atendente_id;
    await pool.query('UPDATE chamados SET status = ?, encerrado_em = NOW() WHERE id = ?', [cancelar ? 'cancelado' : 'encerrado', c.id]);
    await pool.query("INSERT INTO chamado_mensagens (chamado_id, autor, texto) VALUES (?, 'sistema', ?)", [
      c.id,
      cancelar ? 'Chamado cancelado pelo cliente antes do atendimento (saiu da fila).' : 'Chamado encerrado pelo cliente.',
    ]);
    res.json({ success: true, status: cancelar ? 'cancelado' : 'encerrado' });
  }));

  /**
   * Número do AnyDesk que o cliente copiou do programa (cartão "Acesso remoto"): vai para o chamado
   * e fica gravado na Pessoa, para o técnico conectar direto nas próximas vezes
   */
  router.post('/api/publico/suporte/chamado/:token/anydesk', rota(async (req, res) => {
    const c = await doToken(req.params.token);
    if (['encerrado', 'cancelado'].includes(c.status)) throw erro(409, 'Este atendimento foi encerrado.');
    const id = digitos(req.body?.id, 12);
    if (id.length < 9) throw erro(400, 'Digite o número que aparece em "Seu endereço" no AnyDesk (9 ou 10 dígitos).');
    await pool.query("INSERT INTO chamado_mensagens (chamado_id, autor, texto) VALUES (?, 'cliente', ?)", [c.id, `[[anydesk-id:${id}]]`]);
    if (c.pessoa_id) await pool.query('UPDATE pessoas SET anydesk_id = ? WHERE id = ?', [id, c.pessoa_id]);
    res.json({ success: true });
  }));

  /** Avaliação de 1 a 5 do atendimento encerrado (entra em Avaliações, como a do WhatsApp) */
  router.post('/api/publico/suporte/chamado/:token/avaliar', rota(async (req, res) => {
    const c = await doToken(req.params.token);
    if (c.status !== 'encerrado') throw erro(409, 'A avaliação é feita depois que o atendimento termina.');
    if (Number(c.avaliado)) throw erro(409, 'Este atendimento já foi avaliado. Obrigado!');
    const nota = Number(req.body?.nota);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw erro(400, 'Escolha uma nota de 1 a 5.');
    const comentario = texto(req.body?.comentario, 2000) || null;
    await pool.query(
      `INSERT INTO avaliacoes (empresa_id, telefone, pessoa_id, atendente_id, departamento_id, origem, nota, comentario, situacao, pedida_em, respondida_em)
       VALUES (?, ?, ?, ?, ?, 'atendente', ?, ?, 'respondida', NOW(), NOW())`,
      [c.empresa_id, c.contato_telefone || '', c.pessoa_id, c.atendente_id, c.departamento_id, nota, comentario],
    );
    await pool.query("INSERT INTO chamado_mensagens (chamado_id, autor, texto) VALUES (?, 'sistema', ?)", [
      c.id,
      `Cliente avaliou ${'⭐'.repeat(nota)} (${nota})${comentario ? `: ${comentario}` : ''}`,
    ]);
    res.json({ success: true });
  }));

  return router;
}
