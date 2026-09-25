import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { TIPOS_ENDERECO } from './schema.js';

/**
 * Endereços da pessoa (tabela pessoas_enderecos). São editados no próprio cadastro:
 * o formulário manda a lista completa em `enderecos` junto com a pessoa, e aqui ela é
 * sincronizada — sai o que foi removido, atualiza o que tem id, inclui o resto.
 */

export interface Endereco {
  id: number | null;
  tipo: string;
  principal: number;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  codigo_ibge: string | null;
  pais: string | null;
  obs: string | null;
}

const COLUNAS = ['tipo', 'principal', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'codigo_ibge', 'pais', 'obs'] as const;
const MAX_ENDERECOS = 50;

const txt = (v: any, max: number) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Valida e normaliza a lista vinda do formulário (antes de gravar a pessoa, para não
 * gravar pela metade). Endereço totalmente vazio é descartado; se nenhum vier como
 * principal, o primeiro passa a ser.
 */
export function normalizarEnderecos(bruto: unknown): Endereco[] {
  if (!Array.isArray(bruto)) throw new Error('Endereços em formato inválido.');
  if (bruto.length > MAX_ENDERECOS) throw new Error(`Informe no máximo ${MAX_ENDERECOS} endereços.`);
  const tipos = TIPOS_ENDERECO.map((t) => t.value);
  const lista = bruto
    .map((e: any): Endereco => {
      const cep = String(e?.cep ?? '').replace(/\D/g, '');
      if (cep && cep.length !== 8) throw new Error(`CEP inválido: ${e.cep}.`);
      const uf = txt(e?.uf, 2)?.toUpperCase() ?? null;
      if (uf && !/^[A-Z]{2}$/.test(uf)) throw new Error(`UF inválida: ${e.uf}.`);
      const ibge = String(e?.codigo_ibge ?? '').replace(/\D/g, '');
      return {
        id: Number(e?.id) > 0 ? Number(e.id) : null,
        tipo: tipos.includes(e?.tipo) ? e.tipo : 'comercial',
        principal: e?.principal ? 1 : 0,
        cep: cep || null,
        logradouro: txt(e?.logradouro, 255),
        numero: txt(e?.numero, 20),
        complemento: txt(e?.complemento, 100),
        bairro: txt(e?.bairro, 100),
        cidade: txt(e?.cidade, 100),
        uf,
        codigo_ibge: ibge ? ibge.slice(0, 7) : null,
        pais: txt(e?.pais, 60) || 'Brasil',
        obs: txt(e?.obs, 255),
      };
    })
    .filter((e) => e.cep || e.logradouro || e.numero || e.complemento || e.bairro || e.cidade || e.obs);
  // Um principal só: vale o primeiro marcado, ou o primeiro da lista
  const principal = Math.max(0, lista.findIndex((e) => e.principal));
  lista.forEach((e, i) => (e.principal = i === principal ? 1 : 0));
  return lista;
}

/** Deixa os endereços da pessoa iguais à lista, numa transação */
export async function gravarEnderecos(empresaId: string, pessoaId: string, lista: Endereco[]) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ids = lista.map((e) => e.id).filter(Boolean);
    await conn.query(
      `DELETE FROM pessoas_enderecos WHERE empresa_id = ? AND pessoa_id = ?${ids.length ? ' AND id NOT IN (?)' : ''}`,
      ids.length ? [empresaId, pessoaId, ids] : [empresaId, pessoaId],
    );
    for (const e of lista) {
      const valores = COLUNAS.map((c) => e[c]);
      if (e.id) {
        const [r] = await conn.query<any>(
          `UPDATE pessoas_enderecos SET ${COLUNAS.map((c) => `${c} = ?`).join(', ')}
            WHERE id = ? AND empresa_id = ? AND pessoa_id = ?`,
          [...valores, e.id, empresaId, pessoaId],
        );
        if (r.affectedRows) continue; // id de outra pessoa/empresa: entra como novo
      }
      await conn.query(
        `INSERT INTO pessoas_enderecos (empresa_id, pessoa_id, ${COLUNAS.join(', ')}) VALUES (?, ?, ${COLUNAS.map(() => '?').join(', ')})`,
        [empresaId, pessoaId, ...valores],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export function createEnderecosRouter(): Router {
  const router = Router();

  router.get('/pessoas/:id/enderecos', async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT id, ${COLUNAS.join(', ')} FROM pessoas_enderecos
          WHERE empresa_id = ? AND pessoa_id = ? ORDER BY principal DESC, id`,
        [String(res.locals.empresaId), req.params.id],
      );
      res.json(rows);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
