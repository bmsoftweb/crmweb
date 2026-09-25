import { Router, Request, Response } from 'express';
import { pool } from './db';
import { texto, digitos } from './importbm';

/**
 * Importação de pessoas a partir de arquivo (CSV, Excel ou PDF). O navegador lê o
 * arquivo e faz o de → para; aqui chegam as linhas já com os campos do CRM, em lotes.
 *
 * Quem já existe é achado pelo cod_integracao ("ARQ-<código do arquivo>") ou, sem
 * código, pelo CPF/CNPJ. Na atualização só entram os valores preenchidos no arquivo:
 * célula vazia não apaga o que já está no CRM (nem campo personalizado).
 * Os valores padrão do de → para (`padrao`) só completam as pessoas novas.
 *
 * Segmento vem pelo nome (sem diferença de maiúsculas/acentos); o que não existe é
 * criado quando `criarSegmentos` vem ligado.
 *
 * Endereço (end_*): vira o endereço principal da pessoa nova; em quem já existe,
 * completa o principal (ou cria um, se não houver). CEP ou UF inválidos ficam em branco.
 */

const PREFIXO = 'ARQ-';
const TIPO = 'cliente';
const MAX_LINHAS = 2000;
const CAMPOS = ['nome', 'email', 'telefone', 'cpf', 'obs', 'segmento_id'] as const;

const chaveNome = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Objeto simples { campo: texto | número | booleano } do navegador, ou null */
function lerPersonalizados(v: any): Record<string, string | number | boolean> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, x] of Object.entries(v)) {
    if (!/^[a-z0-9_]{1,60}$/.test(k)) continue;
    if (typeof x === 'boolean' || typeof x === 'number') out[k] = x;
    else if (typeof x === 'string' && x.trim()) out[k] = x.slice(0, 1000);
  }
  return Object.keys(out).length ? out : null;
}

const END_CAMPOS = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] as const;
type EnderecoImportado = Record<(typeof END_CAMPOS)[number], string | null>;

const UFS: Record<string, string> = {
  AC: 'acre', AL: 'alagoas', AM: 'amazonas', AP: 'amapa', BA: 'bahia', CE: 'ceara', DF: 'distrito federal',
  ES: 'espirito santo', GO: 'goias', MA: 'maranhao', MG: 'minas gerais', MS: 'mato grosso do sul',
  MT: 'mato grosso', PA: 'para', PB: 'paraiba', PE: 'pernambuco', PI: 'piaui', PR: 'parana',
  RJ: 'rio de janeiro', RN: 'rio grande do norte', RO: 'rondonia', RR: 'roraima', RS: 'rio grande do sul',
  SC: 'santa catarina', SE: 'sergipe', SP: 'sao paulo', TO: 'tocantins',
};

/** "SP", "sp" ou "São Paulo" → "SP"; o que não for estado → null */
export function lerUf(v: any): string | null {
  const s = chaveNome(String(v ?? ''));
  if (!s) return null;
  if (UFS[s.toUpperCase()]) return s.toUpperCase();
  return Object.keys(UFS).find((uf) => UFS[uf] === s) ?? null;
}

function converterEndereco(l: Record<string, any>): EnderecoImportado {
  const cep = String(l.end_cep ?? '').replace(/\D/g, '');
  return {
    cep: cep.length === 8 ? cep : null,
    logradouro: texto(l.end_logradouro, 255),
    numero: texto(l.end_numero, 20),
    complemento: texto(l.end_complemento, 100),
    bairro: texto(l.end_bairro, 100),
    cidade: texto(l.end_cidade, 100),
    uf: lerUf(l.end_uf),
  };
}

const temEndereco = (e: EnderecoImportado) => END_CAMPOS.some((c) => e[c] !== null);

function converter(l: Record<string, any>) {
  const cod = texto(l.cod_integracao, 100);
  return {
    cod_integracao: cod ? `${PREFIXO}${cod}` : null,
    nome: texto(l.nome, 255),
    email: texto(l.email, 255),
    telefone: texto(l.telefone, 50),
    cpf: digitos(l.cpf, 14),
    obs: texto(l.obs, 512),
    segmento: texto(l.segmento, 100),
    segmento_id: null as number | null,
    personalizados: lerPersonalizados(l.personalizados),
    endereco: converterEndereco(l),
  };
}

export function createImportArquivoRouter(): Router {
  const router = Router();

  router.post('/importar/pessoas', async (req: Request, res: Response) => {
    const empresaId = String(res.locals.empresaId);
    const linhas = req.body?.linhas;
    const atualizar = req.body?.atualizar !== false;
    const criarSegmentos = req.body?.criarSegmentos === true;
    // Valores padrão do de → para: só completam as pessoas novas
    const padrao = converter(req.body?.padrao || {});
    if (!Array.isArray(linhas) || !linhas.length) return res.status(400).json({ error: 'Nenhuma linha para importar.' });
    if (linhas.length > MAX_LINHAS) return res.status(413).json({ error: `Envie no máximo ${MAX_LINHAS} linhas por vez.` });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existentes] = await conn.query<any[]>(
        'SELECT id, cod_integracao, cpf FROM pessoas WHERE empresa_id = ? AND (cod_integracao IS NOT NULL OR cpf IS NOT NULL) FOR UPDATE',
        [empresaId],
      );
      const porCodigo = new Map<string, number>();
      const porCpf = new Map<string, number>();
      for (const r of existentes) {
        if (r.cod_integracao) porCodigo.set(String(r.cod_integracao), r.id);
        if (r.cpf) porCpf.set(String(r.cpf), r.id);
      }
      const [segs] = await conn.query<any[]>('SELECT id, nome FROM segmentos WHERE empresa_id = ?', [empresaId]);
      const segmentos = new Map<string, number>(segs.map((s) => [chaveNome(s.nome), s.id]));

      let inseridos = 0, atualizados = 0, ignorados = 0, semNome = 0, segmentosCriados = 0, enderecos = 0;
      const segmentosNaoEncontrados = new Set<string>();

      /** Id do segmento pelo nome; cria quando pedido */
      const idSegmento = async (nome: string | null): Promise<number | null> => {
        if (!nome) return null;
        const k = chaveNome(nome);
        let id = segmentos.get(k);
        if (!id && criarSegmentos) {
          const [r] = await conn.query<any>('INSERT INTO segmentos (empresa_id, nome) VALUES (?, ?)', [empresaId, nome]);
          id = r.insertId as number;
          segmentos.set(k, id);
          segmentosCriados++;
        }
        if (!id) segmentosNaoEncontrados.add(nome);
        return id ?? null;
      };

      /**
       * Endereço principal da pessoa: completa o que existe só com os valores
       * preenchidos, ou cria um. Mudou a cidade, o código IBGE deixa de valer.
       */
      const completarEndereco = async (pessoaId: number, e: EnderecoImportado) => {
        const [atual] = await conn.query<any[]>(
          'SELECT id FROM pessoas_enderecos WHERE empresa_id = ? AND pessoa_id = ? ORDER BY principal DESC, id LIMIT 1',
          [empresaId, pessoaId],
        );
        const cols = END_CAMPOS.filter((c) => e[c] !== null);
        if (atual.length) {
          await conn.query(
            `UPDATE pessoas_enderecos SET ${e.cidade ? 'codigo_ibge = IF(cidade <=> ?, codigo_ibge, NULL), ' : ''}principal = 1${cols
              .map((c) => `, ${c} = ?`)
              .join('')} WHERE id = ?`,
            [...(e.cidade ? [e.cidade] : []), ...cols.map((c) => e[c]), atual[0].id],
          );
        } else {
          await conn.query(
            `INSERT INTO pessoas_enderecos (empresa_id, pessoa_id, tipo, principal${cols.map((c) => `, ${c}`).join('')})
             VALUES (?, ?, 'comercial', 1${cols.map(() => ', ?').join('')})`,
            [empresaId, pessoaId, ...cols.map((c) => e[c])],
          );
        }
        enderecos++;
      };

      for (const bruta of linhas) {
        const p = converter(bruta || {});
        const id = (p.cod_integracao && porCodigo.get(p.cod_integracao)) || (!p.cod_integracao && p.cpf && porCpf.get(p.cpf)) || null;
        if (id) {
          if (!atualizar) { ignorados++; continue; }
          p.segmento_id = await idSegmento(p.segmento);
          const json = p.personalizados ? JSON.stringify(p.personalizados) : null;
          const sets = CAMPOS.filter((c) => p[c] !== null);
          await conn.query(
            `UPDATE pessoas SET tipo = ?${sets.map((c) => `, ${c} = ?`).join('')}${
              json ? ", personalizados = JSON_MERGE_PATCH(COALESCE(NULLIF(personalizados, ''), '{}'), ?)" : ''
            } WHERE id = ? AND empresa_id = ?`,
            [TIPO, ...sets.map((c) => p[c]), ...(json ? [json] : []), id, empresaId],
          );
          if (temEndereco(p.endereco)) await completarEndereco(id, p.endereco);
          atualizados++;
          continue;
        }
        // Pessoa nova: o que veio vazio no arquivo é completado pelo padrão
        for (const c of ['cod_integracao', 'nome', 'email', 'telefone', 'cpf', 'obs', 'segmento'] as const) p[c] ??= padrao[c];
        for (const c of END_CAMPOS) p.endereco[c] ??= padrao.endereco[c];
        if (!p.nome) { semNome++; continue; }
        p.segmento_id = await idSegmento(p.segmento);
        const extras = { ...padrao.personalizados, ...p.personalizados };
        const json = Object.keys(extras).length ? JSON.stringify(extras) : null;
        const [r] = await conn.query<any>(
          `INSERT INTO pessoas (empresa_id, tipo, cod_integracao, nome, email, telefone, cpf, obs, segmento_id, personalizados)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [empresaId, TIPO, p.cod_integracao, p.nome, p.email, p.telefone, p.cpf, p.obs, p.segmento_id, json],
        );
        if (temEndereco(p.endereco)) await completarEndereco(r.insertId, p.endereco);
        // repetidos dentro do próprio arquivo caem na atualização
        if (p.cod_integracao) porCodigo.set(p.cod_integracao, r.insertId);
        if (p.cpf) porCpf.set(p.cpf, r.insertId);
        inseridos++;
      }
      await conn.commit();
      res.json({
        inseridos,
        atualizados,
        ignorados,
        semNome,
        enderecos,
        segmentosCriados,
        segmentosNaoEncontrados: [...segmentosNaoEncontrados].slice(0, 50),
      });
    } catch (err: any) {
      await conn.rollback().catch(() => {});
      res.status(400).json({ error: err.message || 'Falha ao importar as pessoas.' });
    } finally {
      conn.release();
    }
  });

  return router;
}
