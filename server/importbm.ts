import { Router, Request, Response } from 'express';
import { pool } from './db.js';

/**
 * Importação das pessoas do bmsoft (base DBISAM) para o CRM, pela bmAPI.
 *
 * O usuário informa o número do servidor; URL, porta e token (X-API-Key) vêm da
 * tabela MySQL bmapi.servidores — o token nunca chega ao navegador.
 *
 * Chave da importação: bmsoft PESSOAS.ID vira cod_integracao "BM-<id>" na empresa
 * logada — o prefixo diz de qual sistema veio o registro. Quem já existe é
 * atualizado, o resto é incluído.
 *
 * Quem vem de outro sistema é sempre "cliente" (lead é quem nasce aqui no CRM).
 */

/** Prefixo do cod_integracao dos registros vindos do BMsoft */
const PREFIXO = 'BM-';

const PAGINA = 500;
const TIMEOUT_MS = 120_000;

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

async function buscarServidor(numero: number): Promise<Servidor> {
  if (!Number.isInteger(numero) || numero < 1) throw erro(400, 'Informe o número do servidor da bmAPI.');
  const [rows] = await pool.query<any[]>('SELECT id, url, port, token, identificacao FROM bmapi.servidores WHERE id = ? LIMIT 1', [numero]);
  const r = rows[0];
  if (!r || !r.url || !r.token) throw erro(404, `Servidor ${numero} não está cadastrado na bmAPI.`);
  return {
    numero,
    identificacao: String(r.identificacao || `Servidor ${numero}`).trim(),
    baseUrl: montarBaseUrl(r.url, r.port),
    token: String(r.token).trim(),
  };
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

type PessoaImportada = ReturnType<typeof converter>;

/** Lê a tabela PESSOAS inteira, em páginas por ID (o DBISAM não tem OFFSET) */
async function lerPessoasDoBm(servidor: Servidor): Promise<PessoaImportada[]> {
  const todas: PessoaImportada[] = [];
  let ultimo = 0;
  for (;;) {
    const linhas = await consultar(
      servidor,
      `SELECT ID, Nome, Email, Fone1, Celular, Fone2, CPFCNPJ, CAST(Obs AS VARCHAR(512)) Obs
         FROM PESSOAS
        WHERE Ativo = 'S' AND ID > :ultimo
        ORDER BY ID TOP ${PAGINA}`,
      { ultimo },
    );
    if (!linhas.length) break;
    for (const l of linhas) {
      const p = converter(l);
      if (p.nome) todas.push(p); // pessoa sem nome não tem como virar contato
    }
    ultimo = Number(linhas[linhas.length - 1].id);
    if (linhas.length < PAGINA) break;
  }
  return todas;
}

const CAMPOS = ['nome', 'email', 'telefone', 'cpf', 'obs'] as const;

/** Tipo de pessoa dos registros importados */
const TIPO = 'cliente';

export function createImportBmRouter(): Router {
  const router = Router();

  /** Identificação do servidor, para conferir o número digitado antes de importar */
  router.get('/import-bm/servidores/:numero', async (req: Request, res: Response) => {
    try {
      const { numero, identificacao } = await buscarServidor(Number(req.params.numero));
      res.json({ numero, identificacao });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  router.post('/import-bm/pessoas', async (req: Request, res: Response) => {
    const empresaId = String(res.locals.empresaId);
    try {
      const servidor = await buscarServidor(Number(req.body?.servidor));
      const pessoas = await lerPessoasDoBm(servidor);

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

  return router;
}
