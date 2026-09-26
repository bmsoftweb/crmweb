import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { lerConfig } from './config.js';
import { cifrar, decifrar } from './segredo.js';

/**
 * Importação das pessoas (PESSOAS) e dos produtos (PRODUTOSPRINCIPAL) do bmsoft (base
 * DBISAM) para o CRM, pela bmAPI.
 *
 * O usuário informa o token da bmAPI (X-API-Key) uma vez: o CRM procura o servidor dono
 * dele na tabela MySQL bmapi.servidores (URL, porta e identificação) e grava o token
 * cifrado na configuração da empresa (config integracoes.bmapi). Só quem tem o token
 * acessa; ele nunca volta ao navegador.
 *
 * Chave da importação: o ID do bmsoft vira cod_integracao "BM-<id>" na empresa
 * logada — o prefixo diz de qual sistema veio o registro. Quem já existe é
 * atualizado, o resto é incluído.
 *
 * Quem vem de outro sistema é sempre "cliente" (lead é quem nasce aqui no CRM).
 */

/** Prefixo do cod_integracao dos registros vindos do BMsoft */
const PREFIXO = 'BM-';

const PAGINA = 500;
const TIMEOUT_MS = 120_000;

/** Onde o token fica gravado (fora das chaves da rota /config: não é lido nem gravado por ela) */
const GRUPO = 'integracoes';
const CHAVE = 'bmapi';
const ONDE = 'Pessoas › Importar BM';

interface Servidor {
  numero: number;
  identificacao: string;
  baseUrl: string;
  token: string;
}

function erro(status: number, msg: string) {
  return Object.assign(new Error(msg), { status });
}

/** url + port da tabela: aceita com ou sem protocolo, com ou sem porta embutida */
function montarBaseUrl(url: string, port: string): string {
  let base = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  const porta = String(port || '').trim();
  if (porta && !/^https?:\/\/[^/]+:\d+/i.test(base)) {
    const u = new URL(base);
    u.port = porta;
    base = u.toString().replace(/\/+$/, '');
  }
  return base;
}

/** Servidor da bmAPI dono do token (cadastro bmapi.servidores) */
async function servidorDoToken(token: string): Promise<Servidor> {
  const t = String(token || '').trim();
  if (!t) throw erro(400, 'Informe o token da bmAPI.');
  if (t.length > 64) throw erro(400, 'Token da bmAPI inválido.');
  const [rows] = await pool.query<any[]>('SELECT id, url, port, token, identificacao FROM bmapi.servidores WHERE token = ? LIMIT 1', [t]);
  const r = rows[0];
  if (!r || !r.url) throw erro(404, 'Token não encontrado na bmAPI. Confira o token do servidor.');
  return {
    numero: Number(r.id),
    identificacao: String(r.identificacao || `Servidor ${r.id}`).trim(),
    baseUrl: montarBaseUrl(r.url, r.port),
    token: String(r.token).trim(),
  };
}

/** Token gravado da empresa (null = ainda não informado) */
async function tokenGravado(empresaId: string): Promise<string | null> {
  const cfg = await lerConfig(empresaId, GRUPO, CHAVE);
  return cfg?.token_cifrado ? decifrar(cfg.token_cifrado, ONDE) : null;
}

async function gravarToken(empresaId: string, token: string | null) {
  const valor = JSON.stringify(token ? { token_cifrado: cifrar(token) } : null);
  const [existe] = await pool.query<any[]>('SELECT id FROM config WHERE empresa_id = ? AND grupo = ? AND chave = ? LIMIT 1', [empresaId, GRUPO, CHAVE]);
  if (existe.length) await pool.query('UPDATE config SET valor = ? WHERE id = ?', [valor, existe[0].id]);
  else await pool.query('INSERT INTO config (empresa_id, grupo, chave, valor) VALUES (?, ?, ?, ?)', [empresaId, GRUPO, CHAVE, valor]);
}

/** SELECT na bmAPI; devolve as linhas com os nomes de coluna em minúsculas */
async function consultar(servidor: Servidor, sql: string, params: Record<string, any>): Promise<Record<string, any>[]> {
  let resposta: Awaited<ReturnType<typeof fetch>>;
  try {
    resposta = await fetch(`${servidor.baseUrl}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': servidor.token },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: any) {
    const motivo = err?.name === 'TimeoutError' ? 'tempo esgotado' : err?.cause?.code || err?.message;
    throw erro(503, `Não foi possível acessar a bmAPI do servidor ${servidor.numero} (${motivo}).`);
  }
  const data: any = await resposta.json().catch(() => ({}));
  if (!resposta.ok || data?.success === false) {
    if (resposta.status === 401) throw erro(503, `A bmAPI recusou o token cadastrado para o servidor ${servidor.numero}.`);
    throw erro(400, String(data?.error || `bmAPI respondeu HTTP ${resposta.status}`));
  }
  return (data.rows || []).map((linha: Record<string, any>) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(linha)) out[k.toLowerCase()] = v;
    return out;
  });
}

export const texto = (v: any, max: number): string | null => {
  const s = String(v ?? '').trim();
  return s && s !== '[blob]' ? s.slice(0, max) : null;
};

export const digitos = (v: any, max: number): string | null => {
  const s = String(v ?? '').replace(/\D/g, '');
  return s ? s.slice(0, max) : null;
};

/**
 * Uma linha do bmsoft já no formato da tabela pessoas do CRM (de → para):
 * ID → cod_integracao ("BM-<id>"), Nome → nome, Email → email,
 * Fone1/Celular/Fone2 → telefone, CPFCNPJ → cpf, Obs → obs.
 */
function converter(linha: Record<string, any>) {
  return {
    cod_integracao: `${PREFIXO}${linha.id}`,
    nome: texto(linha.nome, 255),
    email: texto(linha.email, 255),
    telefone: texto(linha.fone1, 50) || texto(linha.celular, 50) || texto(linha.fone2, 50),
    cpf: digitos(linha.cpfcnpj, 14),
    obs: texto(linha.obs, 512),
  };
}

/**
 * Uma linha de PRODUTOSPRINCIPAL já no formato da tabela produtos do CRM (de → para):
 * ID → cod_integracao ("BM-<id>") e codigo_sku, Descricao → nome, Texto → descricao,
 * PrecoVenda1 → preco_tabela, UNVenda → unidade_medida, Ativo → ativo.
 */
export function converterProduto(linha: Record<string, any>) {
  const preco = Number(linha.precovenda1);
  return {
    cod_integracao: `${PREFIXO}${linha.id}`,
    codigo_sku: String(linha.id).slice(0, 50),
    nome: texto(linha.descricao, 255),
    descricao: texto(linha.texto, 512), // o DBISAM corta em 512 (limite do CAST)
    preco_tabela: Number.isFinite(preco) && preco > 0 ? Math.round(preco * 100) / 100 : 0,
    unidade_medida: texto(linha.unvenda, 10) || 'UN',
    ativo: String(linha.ativo ?? '').toUpperCase() === 'S' ? 1 : 0,
  };
}

/** Lê uma tabela inteira do bmsoft, em páginas por ID (o DBISAM não tem OFFSET) */
async function lerDoBm<T>(servidor: Servidor, sql: string, converter: (l: Record<string, any>) => T): Promise<T[]> {
  const todas: T[] = [];
  let ultimo = 0;
  for (;;) {
    const linhas = await consultar(servidor, sql, { ultimo });
    if (!linhas.length) break;
    for (const l of linhas) todas.push(converter(l));
    ultimo = Number(linhas[linhas.length - 1].id);
    if (linhas.length < PAGINA) break;
  }
  return todas;
}

const SQL_PESSOAS = `SELECT ID, Nome, Email, Fone1, Celular, Fone2, CPFCNPJ, CAST(Obs AS VARCHAR(512)) Obs
  FROM PESSOAS WHERE Ativo = 'S' AND ID > :ultimo ORDER BY ID TOP ${PAGINA}`;

// Todos (ativos e inativos): produto já importado que ficou inativo no bmsoft é desativado aqui
const SQL_PRODUTOS = `SELECT ID, Descricao, CAST(Texto AS VARCHAR(512)) Texto, PrecoVenda1, UNVenda, Ativo
  FROM PRODUTOSPRINCIPAL WHERE ID > :ultimo ORDER BY ID TOP ${PAGINA}`;

/** Token gravado → servidor (a importação só roda com o token da empresa) */
async function servidorDaEmpresa(empresaId: string): Promise<Servidor> {
  const token = await tokenGravado(empresaId);
  if (!token) throw erro(400, 'Informe o token da bmAPI antes de importar.');
  return servidorDoToken(token);
}

const CAMPOS = ['nome', 'email', 'telefone', 'cpf', 'obs'] as const;

/** Tipo de pessoa dos registros importados */
const TIPO = 'cliente';

export function createImportBmRouter(): Router {
  const router = Router();

  /** Token gravado? E de qual servidor (o token em si não sai daqui) */
  router.get('/import-bm/credencial', async (_req: Request, res: Response) => {
    try {
      const token = await tokenGravado(String(res.locals.empresaId));
      if (!token) return res.json({ definido: false });
      const s = await servidorDoToken(token).catch((err) => ({ erro: err.message }) as const);
      res.json('erro' in s ? { definido: true, erro: s.erro } : { definido: true, servidor: `${s.numero} — ${s.identificacao}` });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /** Servidor do token digitado, para conferir antes de gravar (POST: o token não vai na URL) */
  router.post('/import-bm/credencial/conferir', async (req: Request, res: Response) => {
    try {
      const s = await servidorDoToken(req.body?.token);
      res.json({ servidor: `${s.numero} — ${s.identificacao}` });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /** Grava o token (confere antes na bmAPI de qual servidor ele é) */
  router.put('/import-bm/credencial', async (req: Request, res: Response) => {
    try {
      const s = await servidorDoToken(req.body?.token);
      await gravarToken(String(res.locals.empresaId), s.token);
      res.json({ definido: true, servidor: `${s.numero} — ${s.identificacao}` });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  router.post('/import-bm/pessoas', async (req: Request, res: Response) => {
    const empresaId = String(res.locals.empresaId);
    try {
      const servidor = await servidorDaEmpresa(empresaId);
      // pessoa sem nome não tem como virar contato
      const pessoas = (await lerDoBm(servidor, SQL_PESSOAS, converter)).filter((p) => p.nome);

      const [existentes] = await pool.query<any[]>(
        'SELECT id, cod_integracao, tipo, nome, email, telefone, cpf, obs FROM pessoas WHERE empresa_id = ? AND cod_integracao IS NOT NULL',
        [empresaId],
      );
      const porCodigo = new Map(existentes.map((r) => [String(r.cod_integracao), r]));

      const novas: any[][] = [];
      let atualizados = 0;
      for (const p of pessoas) {
        const atual = porCodigo.get(p.cod_integracao);
        if (!atual) {
          novas.push([empresaId, TIPO, p.cod_integracao, p.nome, p.email, p.telefone, p.cpf, p.obs]);
          continue;
        }
        // nada mudou
        if (atual.tipo === TIPO && CAMPOS.every((c) => (atual[c] ?? null) === (p as any)[c])) continue;
        await pool.query(
          'UPDATE pessoas SET tipo = ?, nome = ?, email = ?, telefone = ?, cpf = ?, obs = ? WHERE id = ? AND empresa_id = ?',
          [TIPO, p.nome, p.email, p.telefone, p.cpf, p.obs, atual.id, empresaId],
        );
        atualizados++;
      }

      for (let i = 0; i < novas.length; i += 200) {
        await pool.query(
          'INSERT INTO pessoas (empresa_id, tipo, cod_integracao, nome, email, telefone, cpf, obs) VALUES ?',
          [novas.slice(i, i + 200)],
        );
      }

      res.json({
        servidor: `${servidor.numero} — ${servidor.identificacao}`,
        lidos: pessoas.length,
        inseridos: novas.length,
        atualizados,
        inalterados: pessoas.length - novas.length - atualizados,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message || 'Falha ao importar as pessoas do bmsoft.' });
    }
  });

  /**
   * Produtos: inclui os ativos que ainda não vieram; atualiza os já importados (inclusive
   * desativando os que ficaram inativos no bmsoft). O SKU é o ID do bmsoft (se já não estiver em uso).
   */
  router.post('/import-bm/produtos', async (req: Request, res: Response) => {
    const empresaId = String(res.locals.empresaId);
    try {
      const servidor = await servidorDaEmpresa(empresaId);
      const produtos = (await lerDoBm(servidor, SQL_PRODUTOS, converterProduto)).filter((p) => p.nome);

      const [existentes] = await pool.query<any[]>(
        'SELECT id, cod_integracao, codigo_sku, nome, descricao, preco_tabela, unidade_medida, ativo FROM produtos WHERE empresa_id = ?',
        [empresaId],
      );
      const porCodigo = new Map(existentes.filter((r) => r.cod_integracao).map((r) => [String(r.cod_integracao), r]));
      const skus = new Set(existentes.map((r) => String(r.codigo_sku ?? '')).filter(Boolean));

      const novas: any[][] = [];
      let atualizados = 0;
      let inativos = 0;
      for (const p of produtos) {
        const atual = porCodigo.get(p.cod_integracao);
        if (!atual) {
          if (!p.ativo) {
            inativos++; // inativo no bmsoft e nunca importado: não entra
            continue;
          }
          const sku = skus.has(p.codigo_sku) ? null : p.codigo_sku;
          if (sku) skus.add(sku);
          novas.push([empresaId, p.cod_integracao, sku, p.nome, p.descricao, p.preco_tabela, p.unidade_medida, 1]);
          continue;
        }
        const igual =
          atual.nome === p.nome &&
          (atual.descricao ?? null) === p.descricao &&
          Number(atual.preco_tabela) === p.preco_tabela &&
          atual.unidade_medida === p.unidade_medida &&
          Number(atual.ativo) === p.ativo;
        if (igual) continue;
        await pool.query(
          'UPDATE produtos SET nome = ?, descricao = ?, preco_tabela = ?, unidade_medida = ?, ativo = ? WHERE id = ? AND empresa_id = ?',
          [p.nome, p.descricao, p.preco_tabela, p.unidade_medida, p.ativo, atual.id, empresaId],
        );
        atualizados++;
      }

      for (let i = 0; i < novas.length; i += 200) {
        await pool.query(
          'INSERT INTO produtos (empresa_id, cod_integracao, codigo_sku, nome, descricao, preco_tabela, unidade_medida, ativo) VALUES ?',
          [novas.slice(i, i + 200)],
        );
      }

      const lidos = produtos.length - inativos;
      res.json({
        servidor: `${servidor.numero} — ${servidor.identificacao}`,
        lidos,
        inseridos: novas.length,
        atualizados,
        inalterados: lidos - novas.length - atualizados,
        inativos,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message || 'Falha ao importar os produtos do bmsoft.' });
    }
  });

  return router;
}
