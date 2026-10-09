import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { exigirAcesso } from './permissoes.js';
import { aposGravar } from './regras.js';

/**
 * Ordens de Serviço: o cadastro é o CRUD genérico (schema.ts); aqui fica o que a tela genérica não faz.
 * Por enquanto, a OS completa para impressão (cliente, técnico e a empresa no cabeçalho).
 */
export function createOsRouter() {
  const router = Router();

  router.get('/os/:id', async (req: Request, res: Response) => {
    try {
      exigirAcesso(res, 'ordens_servico', 'as ordens de serviço');
      const [r] = await pool.query<any[]>(
        `SELECT o.*,
                p.nome AS pessoa_nome, p.cpf AS pessoa_cpf, p.telefone AS pessoa_telefone, p.whatsapp AS pessoa_whatsapp,
                u.nome AS tecnico_nome, c.numero AS chamado_numero,
                e.nome AS empresa_nome, e.cnpj AS empresa_cnpj, e.endereco AS empresa_endereco, e.logo AS empresa_logo
           FROM ordens_servico o
           JOIN empresas e ON e.id = o.empresa_id
           JOIN pessoas p ON p.id = o.pessoa_id
           LEFT JOIN usuarios u ON u.id = o.tecnico_id
           LEFT JOIN chamados c ON c.id = o.chamado_id
          WHERE o.id = ? AND o.empresa_id = ?`,
        [req.params.id, res.locals.empresaId],
      );
      if (!r[0]) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      res.json(r[0]);
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  // ------------------------------------------------------------
  // App do técnico (/tecnico, PWA offline): baixa as OS dele e recebe o que foi feito no cliente
  // ------------------------------------------------------------

  /** As OS do técnico logado: as abertas/em execução e as concluídas/canceladas dos últimos 7 dias */
  router.get('/os-tecnico', async (_req: Request, res: Response) => {
    try {
      exigirAcesso(res, 'ordens_servico', 'as ordens de serviço');
      const [r] = await pool.query<any[]>(
        `SELECT o.id, o.numero, o.tipo, o.status, o.data_agendada, o.hora_inicio, o.hora_fim, o.contato_nome, o.contato_telefone,
                o.endereco, o.servico_solicitado, o.servico_executado, o.inicio_em, o.fim_em, o.assinatura_nome,
                o.assinatura_documento, o.assinatura IS NOT NULL AS assinada, o.atualizado_em,
                p.nome AS pessoa_nome, p.cpf AS pessoa_cpf, p.telefone AS pessoa_telefone, p.whatsapp AS pessoa_whatsapp
           FROM ordens_servico o
           JOIN pessoas p ON p.id = o.pessoa_id
          WHERE o.empresa_id = ? AND o.tecnico_id = ?
            AND (o.status IN ('aberta', 'em_execucao') OR o.atualizado_em >= NOW() - INTERVAL 7 DAY)
          ORDER BY o.data_agendada, o.hora_inicio, o.numero
          LIMIT 500`,
        [res.locals.empresaId, res.locals.usuarioId],
      );
      res.json(r);
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /**
   * Alteração feita no app (pode chegar horas depois, quando o aparelho volta a ter sinal). Só os campos da
   * execução; a agenda e o cliente continuam sendo do escritório. Repetir o envio dá o mesmo resultado.
   */
  router.post('/os-tecnico/:id', async (req: Request, res: Response) => {
    try {
      exigirAcesso(res, 'ordens_servico', 'as ordens de serviço');
      const [r] = await pool.query<any[]>('SELECT status, tecnico_id FROM ordens_servico WHERE id = ? AND empresa_id = ?', [
        req.params.id,
        res.locals.empresaId,
      ]);
      const os = r[0];
      if (!os) return res.status(404).json({ error: 'A OS não existe mais.' });
      if (Number(os.tecnico_id) !== Number(res.locals.usuarioId)) return res.status(409).json({ error: 'A OS foi passada para outro técnico.' });
      if (os.status === 'cancelada') return res.status(409).json({ error: 'A OS foi cancelada pelo escritório.' });

      const b = req.body || {};
      const dados: Record<string, unknown> = {};
      const DATA_HORA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
      const GEO = /^-?\d{1,3}\.\d+,-?\d{1,3}\.\d+$/;
      for (const c of ['inicio_em', 'fim_em']) if (c in b) {
        if (b[c] !== null && !DATA_HORA.test(String(b[c]))) throw new Error(`Data inválida em ${c}.`);
        dados[c] = b[c];
      }
      for (const c of ['inicio_geo', 'fim_geo']) if (c in b) dados[c] = GEO.test(String(b[c])) ? b[c] : null;
      if ('servico_executado' in b) dados.servico_executado = b.servico_executado == null ? null : String(b.servico_executado).slice(0, 20000);
      if ('assinatura_nome' in b) dados.assinatura_nome = String(b.assinatura_nome ?? '').slice(0, 120) || null;
      if ('assinatura_documento' in b) dados.assinatura_documento = String(b.assinatura_documento ?? '').slice(0, 20) || null;
      if ('assinatura' in b) {
        if (b.assinatura !== null && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(b.assinatura))) throw new Error('Assinatura inválida.');
        dados.assinatura = b.assinatura;
      }
      if ('status' in b) {
        if (!['em_execucao', 'concluida'].includes(b.status)) throw new Error('Status inválido.');
        // Concluída fica concluída: um "iniciar" atrasado na fila não reabre a OS
        if (!(os.status === 'concluida' && b.status === 'em_execucao')) dados.status = b.status;
      }
      if (dados.status === 'concluida') {
        const [[atual]] = await pool.query<any>('SELECT servico_executado, assinatura IS NOT NULL AS assinada FROM ordens_servico WHERE id = ?', [req.params.id]);
        if (!String(dados.servico_executado ?? atual.servico_executado ?? '').trim()) throw new Error('Para encerrar, descreva o que foi feito.');
        if (!(dados.assinatura ?? (Number(atual.assinada) || null))) throw new Error('Para encerrar, colete a assinatura do cliente.');
      }

      const cols = Object.keys(dados);
      if (cols.length) {
        await pool.query(`UPDATE ordens_servico SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => dados[c]), req.params.id]);
        await aposGravar('ordens_servico', String(req.params.id));
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return router;
}
