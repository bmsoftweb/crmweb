import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { FieldDef, ResourceDef, RESOURCES, getResource, writableFields, columnNames, colunaSql } from './schema.js';
import { aposGravar, antesDeExcluir, antesDeGravar } from './regras.js';
import { gravarEnderecos, normalizarEnderecos } from './enderecos.js';
import { gravarParticipantes, normalizarParticipantes } from './participantes.js';
import { conferirTrava, contratoDoItem, recalcularContrato } from './contratos.js';

/** Metadados enviados ao navegador: a consulta própria dos combos fica só no servidor */
// O SQL próprio (combos, colunas calculadas) não sai do servidor
const RESOURCES_PUBLICOS = RESOURCES.map(({ optionsSql, minhasSql, ...r }) => ({ ...r, minhas: Boolean(minhasSql), fields: r.fields.map(({ sql, ...f }) => f) }));

/** Converte o valor recebido do formulário para o tipo esperado pela coluna do MySQL */
function coerceValue(field: FieldDef, raw: any): any {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') {
    // Campos obrigatórios em branco viram string vazia; opcionais viram NULL
    return field.required && (field.type === 'text' || field.type === 'cnpj') ? '' : null;
  }

  switch (field.type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'decimal': {
      const n = typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
    case 'cnpj':
      return String(raw).replace(/\D/g, '').slice(0, 14);
    case 'date':
      return String(raw).slice(0, 10);
    case 'datetime':
      return String(raw).replace('T', ' ').slice(0, 19);
    case 'time': {
      const t = String(raw).slice(0, 8);
      return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
    }
    case 'imagem': {
      // Só imagem embutida em base64: o valor vai direto para o src da impressão
      const img = String(raw);
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img)) {
        throw new Error(`O campo "${field.label}" precisa ser uma imagem PNG, JPEG ou WebP.`);
      }
      if (img.length > 1_000_000) throw new Error(`A imagem de "${field.label}" é grande demais (máx. ~700 KB).`);
      return img;
    }
    case 'criterios':
      // Validado e normalizado em antesDeGravar (regras.ts)
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    case 'personalizados': {
      // Objeto { nome_do_campo: valor } vindo do formulário; o conteúdo é livre,
      // mas precisa ser um objeto simples e caber na coluna
      const obj = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error(`O campo "${field.label}" está em formato inválido.`);
      }
      const texto = JSON.stringify(obj);
      if (texto.length > 100_000) throw new Error(`Os dados de "${field.label}" são grandes demais.`);
      return texto === '{}' ? null : texto;
    }
    default:
      return String(raw);
  }
}

/** Monta o payload de gravação a partir do corpo da requisição, aplicando a whitelist de colunas */
function buildWritePayload(resource: ResourceDef, body: Record<string, any>, isUpdate: boolean): Record<string, any> {
  const payload: Record<string, any> = {};

  for (const field of writableFields(resource)) {
    if (!(field.name in body)) continue;

    // Senha: texto puro informado é convertido em bcrypt; em branco mantém a senha atual
    if (field.type === 'password') {
      const plain = String(body[field.name] ?? '');
      if (plain.trim() === '') {
        if (!isUpdate) payload[field.name] = '';
        continue;
      }
      const alreadyHashed = /^\$2[aby]\$/.test(plain);
      payload[field.name] = alreadyHashed ? plain : bcrypt.hashSync(plain, bcrypt.genSaltSync(10));
      continue;
    }

    payload[field.name] = coerceValue(field, body[field.name]);
  }

  return payload;
}

/** Valida os campos obrigatórios antes de tocar no banco, para devolver mensagem amigável */
function validateRequired(resource: ResourceDef, payload: Record<string, any>, isUpdate: boolean) {
  const faltando: string[] = [];

  for (const field of writableFields(resource)) {
    if (!field.required) continue;
    if (field.type === 'password') continue;
    if (isUpdate && !(field.name in payload)) continue;

    const value = payload[field.name];
    if (value === null || value === undefined || value === '') {
      faltando.push(field.label);
    }
  }

  if (faltando.length) {
    throw new Error(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
  }
}

/** Traduz erros do MySQL para mensagens legíveis ao operador */
export function friendlyDbError(err: any, labelSingular = 'registro'): string {
  switch (err?.code) {
    case 'ER_DUP_ENTRY':
      if (/uk_produtos_empresa_sku/.test(err.sqlMessage || '')) return 'Já existe um produto com este SKU nesta empresa.';
      if (/uk_segmentos_empresa_nome/.test(err.sqlMessage || '')) return 'Já existe um segmento com este nome nesta empresa.';
      return `Já existe um registro de ${labelSingular} com esse valor único (${err.sqlMessage?.match(/for key '(.+?)'/)?.[1] || 'chave duplicada'}).`;
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      return `Este ${labelSingular} não pode ser excluído porque existem registros vinculados a ele.`;
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      return 'Um dos vínculos informados (chave estrangeira) não existe. Verifique os campos de seleção.';
    case 'ER_DATA_TOO_LONG':
      return `Um dos campos excedeu o tamanho permitido: ${err.sqlMessage || ''}`;
    case 'ER_BAD_NULL_ERROR':
      return `Um campo obrigatório ficou em branco: ${err.sqlMessage || ''}`;
    case 'WARN_DATA_TRUNCATED':
      return 'Um dos valores selecionados não é aceito por esta coluna. Verifique os campos de seleção.';
    default:
      return err?.sqlMessage || err?.message || 'Erro inesperado ao acessar o banco de dados.';
  }
}

export function createCrudRouter() {
  const router = Router();

  function resolveResource(req: Request): ResourceDef {
    const resource = getResource(req.params.resource);
    if (!resource) {
      throw new Error(`Recurso "${req.params.resource}" não existe.`);
    }
    return resource;
  }

  const pkCol = (resource: ResourceDef) => resource.pk[0];

  /** Empresa (tenant) do usuário logado, resolvida pelo middleware de sessão em server.ts */
  const empresaDa = (res: Response): string => {
    const id = res.locals.empresaId;
    if (!id) throw new Error('Sessão sem empresa. Entre novamente.');
    return String(id);
  };

  /**
   * Toda chave estrangeira gravada precisa apontar para um registro da mesma empresa:
   * sem isso, bastaria mandar o id de um contato de outra empresa num negócio.
   */
  async function validarVinculos(resource: ResourceDef, payload: Record<string, any>, empresaId: string) {
    for (const f of resource.fields) {
      const valor = payload[f.name];
      if (!f.ref || valor === null || valor === undefined || valor === '') continue;
      const alvo = getResource(f.ref.resource)!;
      const [rows] = await pool.query<any[]>(
        `SELECT 1 FROM ${alvo.table} t WHERE ${alvo.scopeSql} AND t.${alvo.pk[0]} = ? LIMIT 1`,
        [empresaId, valor],
      );
      if (!rows.length) throw new Error(`O vínculo "${f.label}" não existe nesta empresa.`);
    }
  }

  /**
   * Listas filhas que vêm junto do registro e são gravadas depois dele: endereços da
   * pessoa, envolvidos do negócio. Validadas antes de gravar o pai (para não gravar pela
   * metade); devolve o que gravar com o id do pai, ou null quando a lista não veio.
   */
  async function filhosDoCorpo(resource: ResourceDef, body: any, empresaId: string) {
    if (resource.name === 'pessoas' && body && 'enderecos' in body) {
      const lista = normalizarEnderecos(body.enderecos);
      return (id: string) => gravarEnderecos(empresaId, id, lista);
    }
    if (resource.name === 'negocios' && body && 'participantes' in body) {
      const ids = await normalizarParticipantes(body.participantes, empresaId);
      return (id: string) => gravarParticipantes(empresaId, id, ids);
    }
    return null;
  }

  // --------------------------------------------------------
  // Metadados: alimenta as telas genéricas de CRUD
  // --------------------------------------------------------
  router.get('/meta/resources', (_req: Request, res: Response) => {
    res.json(RESOURCES_PUBLICOS);
  });

  // --------------------------------------------------------
  // Opções de chave estrangeira (combos dos formulários)
  // --------------------------------------------------------
  router.get('/options/:resource', async (req: Request, res: Response) => {
    try {
      const resource = resolveResource(req);
      const empresaId = empresaDa(res);
      const labelField = String(req.query.label_field || resource.labelField);

      if (!columnNames(resource).includes(labelField) || resource.fields.find((f) => f.name === labelField)?.sql) {
        throw new Error(`Campo de rótulo "${labelField}" inválido.`);
      }

      const sql =
        resource.optionsSql ||
        `SELECT t.${pkCol(resource)} AS value, t.${labelField} AS label
           FROM ${resource.table} t
          WHERE ${resource.scopeSql}
          ORDER BY t.${labelField} ASC
          LIMIT 5000`; // ponytail: o combo filtra no navegador; passando disso, buscar no servidor
      const [rows] = await pool.query<any[]>(sql, [empresaId]);

      res.json(rows.map((r) => ({ value: String(r.value), label: String(r.label ?? r.value) })));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Listagem paginada com busca e ordenação
  // --------------------------------------------------------
  router.get('/crud/:resource', async (req: Request, res: Response) => {
    try {
      const resource = resolveResource(req);

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;

      const sortField = columnNames(resource).includes(String(req.query.sort))
        ? String(req.query.sort)
        : resource.defaultSort.field;
      const dirQ = String(req.query.dir).toLowerCase();
      const sortDir = dirQ === 'asc' ? 'ASC' : dirQ === 'desc' ? 'DESC' : resource.defaultSort.dir.toUpperCase();

      const where: string[] = [resource.scopeSql];
      const params: any[] = [empresaDa(res)];

      // Busca textual nos campos marcados como searchable
      const search = String(req.query.search || '').trim();
      if (search) {
        const searchable = resource.fields.filter((f) => f.searchable);
        if (searchable.length) {
          where.push(`(${searchable.map((f) => `${colunaSql(resource, f.name)} LIKE ?`).join(' OR ')})`);
          searchable.forEach(() => params.push(`%${search}%`));
        }
      }

      // Filtro exato por coluna (painel mestre-detalhe): ?filter_field=negocio_id&filter_value=...
      const filterField = String(req.query.filter_field || '');
      const filterValue = req.query.filter_value;
      if (filterField && filterValue !== undefined && filterValue !== '' && columnNames(resource).includes(filterField)) {
        where.push(`${colunaSql(resource, filterField)} = ?`);
        params.push(filterValue);
      }

      // Só as minhas (?minhas=1): a condição do recurso, com o usuário logado em cada "?"
      if (req.query.minhas === '1' && resource.minhasSql) {
        where.push(resource.minhasSql);
        for (const _ of resource.minhasSql.match(/\?/g) ?? []) params.push(res.locals.usuario.id);
      }

      // Busca avançada: ?filters=[{"field":"status","op":"eq","value":"aberto"}]
      // Coluna e operador passam por whitelist; o valor vai sempre como parâmetro.
      const filtersRaw = String(req.query.filters || '').trim();
      if (filtersRaw) {
        let parsed: any[];
        try {
          parsed = JSON.parse(filtersRaw);
        } catch {
          throw new Error('Parâmetro "filters" não contém um JSON válido.');
        }
        if (!Array.isArray(parsed)) throw new Error('Parâmetro "filters" deve ser uma lista.');
        if (parsed.length > 20) throw new Error('São aceitos no máximo 20 filtros por consulta.');

        const colunas = columnNames(resource);
        for (const f of parsed) {
          const campo = String(f?.field || '');
          const op = String(f?.op || '');
          const valor = f?.value;

          if (!colunas.includes(campo)) {
            throw new Error(`Filtro inválido: a coluna "${campo}" não existe em ${resource.label}.`);
          }
          // Filtrar por hash de senha (LIKE '%a%', '%ab%'...) permitiria reconstruí-lo aos poucos
          if (resource.fields.find((d) => d.name === campo)?.type === 'password') {
            throw new Error(`Filtro inválido: a coluna "${campo}" não pode ser pesquisada.`);
          }
          if (valor === undefined || valor === null || valor === '') continue;

          const ops: Record<string, string> = { eq: '=', ne: '<>', gte: '>=', lte: '<=' };
          if (op === 'contains') {
            where.push(`${colunaSql(resource, campo)} LIKE ?`);
            params.push(`%${valor}%`);
          } else if (ops[op]) {
            where.push(`${colunaSql(resource, campo)} ${ops[op]} ?`);
            params.push(valor);
          } else {
            throw new Error(`Filtro inválido: operador "${op}" não é suportado.`);
          }
        }
      }

      // Lista em árvore: só as raízes (menor "ordem" de cada grupo); os filhos vêm ao expandir
      if (resource.arvore && req.query.arvore === 'raizes') {
        const { grupo, ordem } = resource.arvore;
        where.push(
          `t.${ordem} = (SELECT MIN(r.${ordem}) FROM ${resource.table} r WHERE ${resource.tenantColumn ? `r.${resource.tenantColumn} = t.${resource.tenantColumn} AND ` : ''}r.${grupo} = t.${grupo})`,
        );
      }

      const whereSql = where.join(' AND ');

      const [countRows] = await pool.query<any[]>(`SELECT COUNT(*) AS total FROM ${resource.table} t WHERE ${whereSql}`, params);
      const total = Number(countRows[0]?.total || 0);

      const calculadas = resource.fields.filter((f) => f.sql);
      // A senha nunca sai do servidor, nem em hash
      const senhas = resource.fields.filter((f) => f.type === 'password').map((f) => f.name);
      const [rows] = await pool.query<any[]>(
        `SELECT t.*${calculadas.map((f) => `, ${f.sql} AS ${f.name}`).join('')} FROM ${resource.table} t
          WHERE ${whereSql}
          ORDER BY ${calculadas.some((f) => f.name === sortField) ? sortField : `t.${sortField}`} ${sortDir}
          LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      for (const r of rows) for (const s of senhas) r[s] = r[s] ? '********' : '';

      res.json({ data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Leitura de um registro
  // --------------------------------------------------------
  router.get('/crud/:resource/:id', async (req: Request, res: Response) => {
    try {
      const resource = resolveResource(req);
      const [rows] = await pool.query<any[]>(
        `SELECT t.* FROM ${resource.table} t WHERE ${resource.scopeSql} AND t.${pkCol(resource)} = ? LIMIT 1`,
        [empresaDa(res), req.params.id],
      );
      if (!rows.length) return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      for (const f of resource.fields) if (f.type === 'password') rows[0][f.name] = '';
      res.json(rows[0]);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --------------------------------------------------------
  // Criação
  // --------------------------------------------------------
  router.post('/crud/:resource', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req);
      if (!resource.canCreate) {
        return res.status(403).json({ error: `Não é permitido incluir registros em ${resource.label}.` });
      }

      const empresaId = empresaDa(res);
      const payload = buildWritePayload(resource, req.body || {}, false);
      validateRequired(resource, payload, false);
      await validarVinculos(resource, payload, empresaId);
      await antesDeGravar(resource.name, payload, empresaId);
      await conferirTrava(resource.name, 'incluir', null, payload);
      const filhos = await filhosDoCorpo(resource, req.body, empresaId);

      if (resource.tenantColumn) payload[resource.tenantColumn] = empresaId;
      // Negócio novo sem proprietário escolhido fica com quem o criou
      if (resource.name === 'negocios' && !payload.proprietario_id) payload.proprietario_id = res.locals.usuario.id;
      if (resource.name === 'campanhas') payload.criada_por = res.locals.usuario.id;
      if (resource.name === 'contratos') {
        // Número visível: sequência por empresa (a chave única empresa+número barra repetição)
        const [[n]] = await pool.query<any>('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM contratos WHERE empresa_id = ?', [empresaId]);
        payload.numero = n.n;
        if (!payload.proprietario_id) payload.proprietario_id = res.locals.usuario.id;
      }

      const cols = Object.keys(payload);
      const [result] = await pool.query<any>(
        `INSERT INTO ${resource.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => payload[c]),
      );

      const newId = String(result.insertId);
      await aposGravar(resource.name, newId);
      if (filhos) await filhos(newId);
      res.json({ success: true, id: newId });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  // --------------------------------------------------------
  // Alteração
  // --------------------------------------------------------
  router.put('/crud/:resource/:id', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req);
      if (!resource.canUpdate) {
        return res.status(403).json({ error: `Não é permitido alterar registros em ${resource.label}.` });
      }

      const empresaId = empresaDa(res);
      const payload = buildWritePayload(resource, req.body || {}, true);
      validateRequired(resource, payload, true);
      await validarVinculos(resource, payload, empresaId);
      await antesDeGravar(resource.name, payload, empresaId);
      await conferirTrava(resource.name, 'alterar', req.params.id, payload);
      const filhos = await filhosDoCorpo(resource, req.body, empresaId);

      const cols = Object.keys(payload);
      if (!cols.length) return res.status(400).json({ error: 'Nenhuma alteração foi informada.' });

      // A atividade pode ter trocado de negócio: o negócio anterior também precisa ser recalculado
      const afetados = await antesDeExcluir(resource.name, req.params.id);
      const [result] = await pool.query<any>(
        `UPDATE ${resource.table} t SET ${cols.map((c) => `t.${c} = ?`).join(', ')}
          WHERE ${resource.scopeSql} AND t.${pkCol(resource)} = ?`,
        [...cols.map((c) => payload[c]), empresaId, req.params.id],
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      }

      await aposGravar(resource.name, req.params.id, afetados);
      if (filhos) await filhos(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  // --------------------------------------------------------
  // Exclusão
  // --------------------------------------------------------
  router.delete('/crud/:resource/:id', async (req: Request, res: Response) => {
    let resource: ResourceDef | null = null;
    try {
      resource = resolveResource(req);
      if (!resource.canDelete) {
        return res.status(403).json({ error: `Não é permitido excluir registros em ${resource.label}.` });
      }

      await conferirTrava(resource.name, 'excluir', req.params.id, null);
      const afetados = await antesDeExcluir(resource.name, req.params.id);
      // Item de contrato: o contrato precisa ser recalculado depois que o item sair
      const contratoAfetado = resource.name === 'contrato_itens' ? await contratoDoItem(req.params.id) : null;
      const [result] = await pool.query<any>(
        resource.exclusaoLogica
          ? `UPDATE ${resource.table} t SET t.${resource.exclusaoLogica} = NOW() WHERE ${resource.scopeSql} AND t.${pkCol(resource)} = ?`
          : `DELETE t FROM ${resource.table} t WHERE ${resource.scopeSql} AND t.${pkCol(resource)} = ?`,
        [empresaDa(res), req.params.id],
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: `${resource.labelSingular} não encontrado.` });
      }

      // Na exclusão lógica o registro continua existindo e as regras ainda o enxergam
      await aposGravar(resource.name, resource.exclusaoLogica ? req.params.id : null, afetados);
      if (contratoAfetado) await recalcularContrato(contratoAfetado);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: friendlyDbError(err, resource?.labelSingular) });
    }
  });

  return router;
}

