import { Router, Request, Response } from 'express';
import { del } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { pool } from './db.js';

/**
 * Anexos da proposta (PDFs, imagens...) no Vercel Blob. Ficam ligados ao NÚMERO da proposta, então todas as
 * versões mostram os mesmos anexos. O navegador manda o arquivo direto para o Blob (sem o limite de 4,5 MB da
 * requisição na Vercel): aqui só se libera o envio (token) e depois se grava o registro.
 *  - caminho  propostas/<empresa_id>/<número da proposta>/<nome do arquivo>-<sufixo aleatório>
 *  - público, mas com sufixo aleatório (o endereço não é adivinhável)
 * Precisa de BLOB_READ_WRITE_TOKEN (o mesmo das fotos dos produtos).
 */

const MAX_ANEXO = 25 * 1024 * 1024;
const URL_BLOB = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/([^\s"'<>?]+)/i;

function erro(status: number, msg: string) {
  return Object.assign(new Error(msg), { status });
}

const rota =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message || 'Falha nos anexos.' });
    }
  };

/** Número da proposta (da empresa logada): a chave dos anexos */
async function numeroDaProposta(id: string, emp: string): Promise<number> {
  const [r] = await pool.query<any[]>('SELECT numero_proposta FROM propostas WHERE id = ? AND empresa_id = ?', [id, emp]);
  if (!r[0]) throw erro(404, 'Proposta não encontrada.');
  return Number(r[0].numero_proposta);
}

const prefixo = (emp: string, numero: number) => `propostas/${emp}/${numero}/`;

/** Anexos da proposta (pelo número), na ordem em que foram incluídos: para o envio por e-mail e WhatsApp */
export async function anexosDaProposta(emp: string, numero: number): Promise<{ nome: string; url: string; tipo: string | null; tamanho: number }[]> {
  const [r] = await pool.query<any[]>('SELECT nome, url, tipo, tamanho FROM proposta_anexos WHERE empresa_id = ? AND numero_proposta = ? ORDER BY id', [emp, numero]);
  return r.map((a) => ({ ...a, tamanho: Number(a.tamanho) }));
}

/** Conteúdo do anexo, baixado do Blob */
export async function baixarAnexo(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw erro(502, `Não foi possível ler o anexo do storage (HTTP ${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

export function createAnexosRouter(): Router {
  const router = Router();

  /** Anexos da proposta (os mesmos em todas as versões) */
  router.get('/crm/propostas/:id/anexos', rota(async (req, res) => {
    const emp = String(res.locals.empresaId);
    const numero = await numeroDaProposta(req.params.id, emp);
    const [r] = await pool.query<any[]>(
      `SELECT a.id, a.nome, a.url, a.tipo, a.tamanho, DATE_FORMAT(a.criado_em, '%Y-%m-%d %H:%i:%s') AS criado_em, u.nome AS usuario_nome
         FROM proposta_anexos a LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.empresa_id = ? AND a.numero_proposta = ? ORDER BY a.id`,
      [emp, numero],
    );
    res.json(r);
  }));

  /**
   * Libera o envio direto do navegador para o Blob (client upload). O caminho tem de ser o da proposta
   * informada no clientPayload, e o tamanho fica limitado a 25 MB.
   */
  router.post('/crm/anexos/upload', rota(async (req, res) => {
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      throw erro(503, 'Storage não configurado: crie o Blob em Vercel › Storage e ligue ao projeto (BLOB_READ_WRITE_TOKEN).');
    }
    const emp = String(res.locals.empresaId);
    const r = await handleUpload({
      request: req,
      body: req.body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const numero = await numeroDaProposta(String(JSON.parse(clientPayload || '{}').proposta_id ?? ''), emp);
        if (!pathname.startsWith(prefixo(emp, numero))) throw erro(400, 'Caminho do anexo inválido.');
        return { maximumSizeInBytes: MAX_ANEXO, addRandomSuffix: true };
      },
    });
    res.json(r);
  }));

  /** Grava o anexo já enviado ao Blob (o endereço tem de estar na pasta da proposta) */
  router.post('/crm/propostas/:id/anexos', rota(async (req, res) => {
    const emp = String(res.locals.empresaId);
    const numero = await numeroDaProposta(req.params.id, emp);
    const url = String(req.body?.url ?? '');
    const caminho = URL_BLOB.exec(url)?.[1];
    if (!caminho || !decodeURIComponent(caminho).startsWith(prefixo(emp, numero))) throw erro(400, 'Endereço do anexo inválido.');
    const nome = String(req.body?.nome ?? '').trim().slice(0, 255) || 'anexo';
    const tipo = String(req.body?.tipo ?? '').slice(0, 100) || null;
    const tamanho = Math.max(0, Math.trunc(Number(req.body?.tamanho) || 0));
    const [r] = await pool.query<any>(
      'INSERT INTO proposta_anexos (empresa_id, numero_proposta, nome, url, tipo, tamanho, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [emp, numero, nome, url, tipo, tamanho, res.locals.usuarioId ?? null],
    );
    res.json({ success: true, id: Number(r.insertId) });
  }));

  /** Exclui o anexo (de todas as versões) e o arquivo do Blob */
  router.delete('/crm/propostas/:id/anexos/:anexoId', rota(async (req, res) => {
    const emp = String(res.locals.empresaId);
    const numero = await numeroDaProposta(req.params.id, emp);
    const [a] = await pool.query<any[]>('SELECT id, url FROM proposta_anexos WHERE id = ? AND empresa_id = ? AND numero_proposta = ?', [
      req.params.anexoId,
      emp,
      numero,
    ]);
    if (!a[0]) throw erro(404, 'Anexo não encontrado.');
    await pool.query('DELETE FROM proposta_anexos WHERE id = ?', [a[0].id]);
    // Falha aqui não desfaz a exclusão: só fica o arquivo órfão no Blob
    await del(a[0].url).catch((err) => console.error(`Anexos: não apagou do Blob: ${err.message}`));
    res.json({ success: true });
  }));

  return router;
}
