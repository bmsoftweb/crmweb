import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { del, put } from '@vercel/blob';
import { pool } from './db.js';
import { buscarFora } from './jornada.js';

/**
 * Fotos dos produtos (coluna produtos.fotos, JSON com até 4 endereços) no Vercel Blob.
 * O navegador reduz a foto (400 px no lado maior, JPEG) e manda aqui; foto da internet passa
 * antes pelo servidor (o navegador não consegue ler imagem de outro site). Foto que sai do
 * cadastro, ou do produto excluído, é apagada do Blob depois de gravar.
 *
 * Mesmo padrão de arquivo do b2b (b2bweb/admin server/fotos.ts e o integrador):
 *  - caminho fixo  produtos/<empresa_id>/<id do produto com 9 dígitos>-<posição 1 a 4>.jpg
 *  - público, sem sufixo aleatório, sobrescreve o que existir, cache de 1 ano
 *  - endereço gravado com ?v=<8 primeiros caracteres do MD5> (fura o cache quando a foto muda)
 * Precisa de BLOB_READ_WRITE_TOKEN (Vercel › Storage › Blob, ligado ao projeto).
 */

export const MAX_FOTOS = 4;
/** Foto já reduzida pelo navegador (400 px): folga para JPEG de boa qualidade */
const MAX_FOTO = 1_000_000;
const CACHE_MAX_AGE = 31_536_000; // 1 ano, igual ao b2b

/** Caminho da foto no Blob (padrão do b2b): o id nunca é truncado, só fica mais longo */
export const caminhoFoto = (empresaId: number | string, produtoId: number | string, posicao: number) =>
  `produtos/${empresaId}/${String(produtoId).padStart(9, '0')}-${posicao}.jpg`;

/** Endereço sem o ?v= (o mesmo arquivo pode ter versões diferentes no cadastro) */
const semVersao = (u: string) => u.split('?')[0];
/** Imagem da internet, antes de reduzir (a resposta da Vercel aceita até ~4,5 MB) */
const MAX_ORIGINAL = 3_000_000;

/** Endereço de foto aceito no cadastro: só do Vercel Blob */
export const URL_FOTO = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>]+$/i;

function erro(status: number, msg: string) {
  return Object.assign(new Error(msg), { status });
}

/** Valor do formulário → JSON da coluna (null = sem fotos) */
export function prepararFotos(raw: unknown, rotulo: string): string | null {
  const lista = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (lista === null || lista === undefined) return null;
  if (!Array.isArray(lista)) throw new Error(`O campo "${rotulo}" está em formato inválido.`);
  if (lista.length > MAX_FOTOS) throw new Error(`No máximo ${MAX_FOTOS} fotos.`);
  for (const u of lista) if (typeof u !== 'string' || !URL_FOTO.test(u)) throw new Error(`Foto com endereço inválido em "${rotulo}".`);
  return lista.length ? JSON.stringify(lista) : null;
}

const lerLista = (v: unknown): string[] => {
  const l = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v;
  return Array.isArray(l) ? l.filter((u) => typeof u === 'string' && URL_FOTO.test(u)) : [];
};

/** Fotos gravadas do produto (antes de alterar ou excluir) */
export async function fotosDoProduto(id: string, empresaId: string): Promise<string[]> {
  const [r] = await pool.query<any[]>('SELECT fotos FROM produtos WHERE id = ? AND empresa_id = ?', [id, empresaId]);
  return lerLista(r[0]?.fotos);
}

/**
 * Apaga do Blob as fotos que saíram (falha aqui não desfaz a gravação: só fica o arquivo órfão).
 * Compara pelo arquivo, sem o ?v=: foto trocada na mesma posição sobrescreveu o arquivo e continua.
 */
export async function apagarFotosRemovidas(antes: string[], depois: unknown) {
  const ficam = new Set(lerLista(depois).map(semVersao));
  const sairam = [...new Set(antes.map(semVersao))].filter((u) => !ficam.has(u));
  if (!sairam.length) return;
  await del(sairam).catch((err) => console.error(`Fotos: não apagou do Blob (${sairam.length}): ${err.message}`));
}

export function createFotosRouter(): Router {
  const router = Router();

  /** Grava no Blob a foto já reduzida pelo navegador (data URI JPEG) na posição 1 a 4 do produto */
  router.post('/produtos/:id/fotos/:posicao', async (req: Request, res: Response) => {
    try {
      const empresaId = String(res.locals.empresaId);
      const produtoId = Number(req.params.id);
      const posicao = Number(req.params.posicao);
      if (!Number.isInteger(produtoId) || produtoId <= 0) throw erro(400, 'Salve o produto antes de incluir fotos.');
      if (!Number.isInteger(posicao) || posicao < 1 || posicao > MAX_FOTOS) throw erro(400, `A foto deve ser da posição 1 a ${MAX_FOTOS}.`);
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.imagem ?? ''));
      const dados = m ? Buffer.from(m[1], 'base64') : Buffer.alloc(0);
      // Assinatura JPEG (FF D8 FF)
      if (!(dados[0] === 0xff && dados[1] === 0xd8 && dados[2] === 0xff)) throw erro(415, 'A foto precisa chegar em JPEG.');
      if (dados.length > MAX_FOTO) throw erro(413, 'Foto grande demais depois de reduzida.');
      if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
        throw erro(503, 'Storage de fotos não configurado: crie o Blob em Vercel › Storage e ligue ao projeto (BLOB_READ_WRITE_TOKEN).');
      }
      const [p] = await pool.query<any[]>('SELECT id FROM produtos WHERE id = ? AND empresa_id = ? LIMIT 1', [produtoId, empresaId]);
      if (!p.length) throw erro(404, 'Produto não encontrado nesta empresa.');
      const blob = await put(caminhoFoto(empresaId, produtoId, posicao), dados, {
        access: 'public',
        contentType: 'image/jpeg',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: CACHE_MAX_AGE,
      });
      const versao = crypto.createHash('md5').update(dados).digest('hex').slice(0, 8);
      res.json({ url: `${blob.url}?v=${versao}` });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  /** Baixa uma imagem da internet para o navegador reduzir (só https público, até 3 MB) */
  router.post('/produtos/fotos/buscar', async (req: Request, res: Response) => {
    try {
      const url = String(req.body?.url ?? '').trim();
      if (!/^https:\/\//i.test(url)) throw erro(400, 'Informe o endereço da imagem (https://...).');
      let r: globalThis.Response;
      try {
        // User-Agent de navegador: vários sites (Wikimedia, CDNs) recusam pedido sem ele
        r = await buscarFora(url, { headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0 (compatible; CRMWeb/1.0; +https://bmsoftweb-crm.vercel.app)' } });
      } catch (err: any) {
        throw erro(400, `Não foi possível baixar a imagem: ${err.message}`);
      }
      const tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(tipo)) throw erro(400, `O endereço não devolveu uma imagem JPEG, PNG, WebP ou GIF (HTTP ${r.status}).`);
      const dados = Buffer.from(await r.arrayBuffer());
      if (dados.length > MAX_ORIGINAL) throw erro(413, 'Imagem maior que 3 MB: baixe, reduza e envie o arquivo.');
      res.json({ imagem: `data:${tipo};base64,${dados.toString('base64')}` });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}
