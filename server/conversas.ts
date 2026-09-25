import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { enviarWhatsApp, pessoaDoTelefone } from './whatsapp.js';

/**
 * Tela de conversas do WhatsApp: uma conversa por telefone (whatsapp_mensagens.telefone, só
 * dígitos com DDI). As mensagens chegam pelo webhook da Evolution (server/whatsapp.ts).
 */

const TELEFONE = /^\d{8,15}$/;

const falha = (res: Response, err: any) => res.status(err.status || 400).json({ error: err.message });

export function createConversasRouter(): Router {
  const router = Router();

  /** Recebidas ainda não vistas, para a etiqueta do menu */
  router.get('/whatsapp/nao-vistas', async (_req: Request, res: Response) => {
    try {
      const [r] = await pool.query<any[]>(
        "SELECT COUNT(*) AS total FROM whatsapp_mensagens WHERE empresa_id = ? AND direcao = 'recebida' AND vista = 0",
        [res.locals.empresaId],
      );
      res.json({ total: Number(r[0].total) });
    } catch (err: any) {
      falha(res, err);
    }
  });

  /** Conversas, da mais recente para a mais antiga, com a última mensagem e as não vistas */
  router.get('/whatsapp/conversas', async (req: Request, res: Response) => {
    try {
      const busca = String(req.query.busca ?? '').trim().slice(0, 100);
      const digitos = busca.replace(/\D/g, '');
      const [rows] = await pool.query<any[]>(
        `SELECT w.telefone, x.pessoa_id, p.nome, w.direcao, w.tipo, w.texto, w.arquivo_nome, w.situacao,
                DATE_FORMAT(w.data_hora, '%Y-%m-%d %H:%i:%s') AS data_hora, x.nao_vistas
           FROM (SELECT telefone, MAX(id) AS ultima, MAX(pessoa_id) AS pessoa_id,
                        SUM(direcao = 'recebida' AND vista = 0) AS nao_vistas
                   FROM whatsapp_mensagens WHERE empresa_id = ? GROUP BY telefone) x
           JOIN whatsapp_mensagens w ON w.id = x.ultima
           LEFT JOIN pessoas p ON p.id = x.pessoa_id
          WHERE (? = '' OR p.nome LIKE ? OR (? <> '' AND w.telefone LIKE ?))
          ORDER BY w.data_hora DESC, w.id DESC
          LIMIT 200`,
        [res.locals.empresaId, busca, `%${busca}%`, digitos, `%${digitos}%`],
      );
      res.json(rows.map((r) => ({ ...r, nao_vistas: Number(r.nao_vistas) })));
    } catch (err: any) {
      falha(res, err);
    }
  });

  /**
   * Mensagens da conversa (as 300 mais recentes, em ordem) e a pessoa. Abrir marca as recebidas
   * como vistas. Conversa sem pessoa tenta achá-la de novo (ela pode ter sido cadastrada depois).
   */
  router.get('/whatsapp/conversas/:telefone', async (req: Request, res: Response) => {
    try {
      const emp = res.locals.empresaId;
      const telefone = req.params.telefone;
      if (!TELEFONE.test(telefone)) return res.status(400).json({ error: 'Telefone inválido.' });
      const [ult] = await pool.query<any[]>(
        'SELECT MAX(pessoa_id) AS pessoa_id FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ?',
        [emp, telefone],
      );
      let pessoaId: number | null = ult[0]?.pessoa_id ?? null;
      if (!pessoaId) {
        pessoaId = await pessoaDoTelefone(emp, telefone);
        if (pessoaId) await pool.query('UPDATE whatsapp_mensagens SET pessoa_id = ? WHERE empresa_id = ? AND telefone = ? AND pessoa_id IS NULL', [pessoaId, emp, telefone]);
      }
      await pool.query("UPDATE whatsapp_mensagens SET vista = 1 WHERE empresa_id = ? AND telefone = ? AND direcao = 'recebida' AND vista = 0", [emp, telefone]);
      const [mensagens] = await pool.query<any[]>(
        `SELECT * FROM (
           SELECT w.id, w.direcao, w.tipo, w.texto, w.arquivo_nome, w.situacao, u.nome AS usuario_nome,
                  (w.disparo_id IS NOT NULL) AS campanha, DATE_FORMAT(w.data_hora, '%Y-%m-%d %H:%i:%s') AS data_hora
             FROM whatsapp_mensagens w LEFT JOIN usuarios u ON u.id = w.usuario_id
            WHERE w.empresa_id = ? AND w.telefone = ?
            ORDER BY w.data_hora DESC, w.id DESC LIMIT 300) m
          ORDER BY m.data_hora, m.id`,
        [emp, telefone],
      );
      const [pessoa] = pessoaId ? await pool.query<any[]>('SELECT id, nome FROM pessoas WHERE id = ? AND empresa_id = ?', [pessoaId, emp]) : [[]];
      res.json({ pessoa: pessoa[0] ?? null, mensagens: mensagens.map((m) => ({ ...m, campanha: Boolean(m.campanha) })) });
    } catch (err: any) {
      falha(res, err);
    }
  });

  /** Responde pela tela: texto enviado pelo WhatsApp da empresa, registrado com o usuário */
  router.post('/whatsapp/conversas/:telefone', async (req: Request, res: Response) => {
    try {
      const emp = res.locals.empresaId;
      const telefone = req.params.telefone;
      if (!TELEFONE.test(telefone)) return res.status(400).json({ error: 'Telefone inválido.' });
      const texto = String(req.body?.texto ?? '').trim();
      if (!texto) return res.status(400).json({ error: 'Digite a mensagem.' });
      if (texto.length > 4000) return res.status(400).json({ error: 'Mensagem grande demais (máximo de 4.000 caracteres).' });
      const [ult] = await pool.query<any[]>('SELECT MAX(pessoa_id) AS pessoa_id FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ?', [emp, telefone]);
      await enviarWhatsApp(emp, telefone, texto, { pessoa_id: ult[0]?.pessoa_id ?? null, usuario_id: res.locals.usuarioId });
      res.json({ success: true });
    } catch (err: any) {
      falha(res, err);
    }
  });

  return router;
}
