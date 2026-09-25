import { Router, Request, Response } from 'express';
import { pool } from './db';

/**
 * Envolvidos no negócio (tabela negocios_participantes): outros usuários da empresa,
 * além do proprietário. O formulário do negócio manda a lista completa de ids em
 * `participantes` e aqui ela é sincronizada.
 */

const MAX_PARTICIPANTES = 50;

/** Ids únicos, validados como usuários da empresa (antes de gravar o negócio) */
export async function normalizarParticipantes(bruto: unknown, empresaId: string): Promise<number[]> {
  if (!Array.isArray(bruto)) throw new Error('Envolvidos em formato inválido.');
  const ids = Array.from(new Set(bruto.map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  if (ids.length > MAX_PARTICIPANTES) throw new Error(`Informe no máximo ${MAX_PARTICIPANTES} envolvidos.`);
  if (!ids.length) return [];
  const [rows] = await pool.query<any[]>('SELECT id FROM usuarios WHERE empresa_id = ? AND id IN (?)', [empresaId, ids]);
  if (rows.length !== ids.length) throw new Error('Um dos envolvidos não é usuário desta empresa.');
  return ids;
}

/** O proprietário já é o dono do negócio: não fica também como envolvido */
export async function tirarProprietarioDosEnvolvidos(negocioId: string, db: { query: typeof pool.query } = pool) {
  await db.query(
    `DELETE np FROM negocios_participantes np
       JOIN negocios n ON n.id = np.negocio_id AND n.proprietario_id = np.usuario_id
      WHERE np.negocio_id = ?`,
    [negocioId],
  );
}

/** Deixa os envolvidos do negócio iguais à lista */
export async function gravarParticipantes(empresaId: string, negocioId: string, ids: number[]) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `DELETE FROM negocios_participantes WHERE empresa_id = ? AND negocio_id = ?${ids.length ? ' AND usuario_id NOT IN (?)' : ''}`,
      ids.length ? [empresaId, negocioId, ids] : [empresaId, negocioId],
    );
    if (ids.length) {
      await conn.query('INSERT IGNORE INTO negocios_participantes (empresa_id, negocio_id, usuario_id) VALUES ?', [
        ids.map((u) => [empresaId, negocioId, u]),
      ]);
    }
    await tirarProprietarioDosEnvolvidos(negocioId, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export function createParticipantesRouter(): Router {
  const router = Router();

  router.get('/negocios/:id/participantes', async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT p.usuario_id AS id, u.nome FROM negocios_participantes p JOIN usuarios u ON u.id = p.usuario_id
          WHERE p.empresa_id = ? AND p.negocio_id = ? ORDER BY u.nome`,
        [String(res.locals.empresaId), req.params.id],
      );
      res.json(rows);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
