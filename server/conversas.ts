import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { chaveTelefone, donoDoTelefone, enviarWhatsApp, telefoneWhatsApp } from './whatsapp.js';
import { sincronizarNegocio } from './regras.js';

/**
 * Tela de conversas do WhatsApp: uma conversa por telefone (whatsapp_mensagens.telefone, só
 * dígitos com DDI). As mensagens chegam pelo webhook da Evolution (server/whatsapp.ts).
 */

const TELEFONE = /^\d{8,15}$/;

/** Nome de perfil mais recente da conversa da mensagem m (quem mandou, no WhatsApp) */
const NOME_CONTATO = (m: string) =>
  `(SELECT z.nome_contato FROM whatsapp_mensagens z
     WHERE z.empresa_id = ${m}.empresa_id AND z.telefone = ${m}.telefone AND z.nome_contato IS NOT NULL
     ORDER BY z.id DESC LIMIT 1)`;

const falha = (res: Response, err: any) => res.status(err.status || 400).json({ error: err.message });

/**
 * Número da conversa para um telefone do cadastro: a conversa que já existe com ele (o WhatsApp
 * costuma guardar sem o 9), ou o próprio número com DDI
 */
async function numeroDaConversa(empresaId: string, telefone: string): Promise<string> {
  const chave = chaveTelefone(telefone, true);
  if (!chave) return telefone;
  const [rows] = await pool.query<any[]>(
    'SELECT DISTINCT telefone FROM whatsapp_mensagens WHERE empresa_id = ? AND RIGHT(telefone, 8) = ?',
    [empresaId, chave.slice(-8)],
  );
  return rows.find((r) => chaveTelefone(r.telefone, true) === chave)?.telefone ?? telefone;
}

export function createConversasRouter(): Router {
  const router = Router();

  /**
   * Conversa de uma atividade do tipo WhatsApp (clique na ficha do negócio): o telefone da pessoa
   * da atividade, ou o da pessoa do negócio
   */
  router.get('/whatsapp/atividades/:id/conversa', async (req: Request, res: Response) => {
    try {
      const emp = res.locals.empresaId;
      const [rows] = await pool.query<any[]>(
        `SELECT a.id, a.assunto, a.concluida,
                COALESCE(NULLIF(pa.whatsapp, ''), NULLIF(pa.telefone, ''), NULLIF(pn.whatsapp, ''), pn.telefone) AS telefone,
                IF(COALESCE(NULLIF(pa.whatsapp, ''), NULLIF(pa.telefone, '')) IS NULL, pn.nome, pa.nome) AS nome
           FROM atividades a
           LEFT JOIN pessoas pa ON pa.id = a.pessoa_id
           LEFT JOIN negocios n ON n.id = a.negocio_id
           LEFT JOIN pessoas pn ON pn.id = n.pessoa_id
          WHERE a.id = ? AND a.empresa_id = ?`,
        [req.params.id, emp],
      );
      const a = rows[0];
      if (!a) return res.status(404).json({ error: 'Atividade não encontrada.' });
      if (!a.telefone) return res.status(400).json({ error: `${a.nome ? `${a.nome} não tem` : 'A atividade não tem pessoa com'} telefone cadastrado.` });
      const telefone = await numeroDaConversa(emp, telefoneWhatsApp(a.telefone));
      res.json({ telefone, nome: a.nome, atividade: { id: a.id, assunto: a.assunto, concluida: Boolean(Number(a.concluida)) } });
    } catch (err: any) {
      falha(res, err);
    }
  });

  /**
   * Nova conversa: pessoas e contatos (ativos) pelo nome ou pelo número. Cada um vem com o número
   * da conversa (WhatsApp; sem ele, telefone/celular) ou o motivo de não ter como mandar.
   * Busca só com dígitos (10 ou mais) oferece também o número digitado.
   */
  router.get('/whatsapp/destinos', async (req: Request, res: Response) => {
    try {
      const emp = String(res.locals.empresaId);
      const busca = String(req.query.busca ?? '').trim().slice(0, 100);
      if (busca.length < 2) return res.json([]);
      const digitos = busca.replace(/\D/g, '');
      const nome = `%${busca}%`;
      // Número: compara os dígitos do cadastro (a busca pode vir formatada ou não)
      const numero = (c: string) => (digitos.length >= 4 ? `REGEXP_REPLACE(COALESCE(${c}, ''), '[^0-9]', '') LIKE ?` : 'FALSE');
      const pNum = digitos.length >= 4 ? [`%${digitos}%`, `%${digitos}%`] : [];
      const cNum = digitos.length >= 4 ? [`%${digitos}%`, `%${digitos}%`, `%${digitos}%`] : [];
      const [pessoas] = await pool.query<any[]>(
        `SELECT id AS pessoa_id, nome, COALESCE(NULLIF(whatsapp, ''), NULLIF(telefone, '')) AS fone
           FROM pessoas WHERE empresa_id = ? AND (nome LIKE ? OR ${numero('whatsapp')} OR ${numero('telefone')})
          ORDER BY COALESCE(NULLIF(whatsapp, ''), NULLIF(telefone, '')) IS NULL, nome LIMIT 15`,
        [emp, nome, ...pNum],
      );
      const [contatos] = await pool.query<any[]>(
        `SELECT c.id AS contato_id, c.pessoa_id, c.nome, p.nome AS pessoa_nome, COALESCE(c.departamento, c.cargo) AS setor,
                COALESCE(NULLIF(c.whatsapp, ''), NULLIF(c.celular, ''), NULLIF(c.telefone, '')) AS fone
           FROM pessoas_contatos c JOIN pessoas p ON p.id = c.pessoa_id
          WHERE c.empresa_id = ? AND c.ativo = 1 AND (c.nome LIKE ? OR p.nome LIKE ? OR ${numero('c.whatsapp')} OR ${numero('c.celular')} OR ${numero('c.telefone')})
          ORDER BY COALESCE(NULLIF(c.whatsapp, ''), NULLIF(c.celular, ''), NULLIF(c.telefone, '')) IS NULL, p.nome, c.principal DESC, c.nome LIMIT 15`,
        [emp, nome, nome, ...cNum],
      );
      /** Número da conversa, ou o motivo de não dar para mandar */
      const destino = async (fone: string | null) => {
        if (!fone) return { telefone: null, aviso: 'sem telefone cadastrado' };
        try {
          return { telefone: await numeroDaConversa(emp, telefoneWhatsApp(fone)), aviso: null };
        } catch {
          return { telefone: null, aviso: `telefone sem DDD (${fone})` };
        }
      };
      const lista: any[] = [];
      for (const p of pessoas) lista.push({ tipo: 'pessoa', pessoa_id: p.pessoa_id, contato_id: null, nome: p.nome, detalhe: null, fone: p.fone, ...(await destino(p.fone)) });
      for (const c of contatos) {
        lista.push({
          tipo: 'contato',
          pessoa_id: c.pessoa_id,
          contato_id: c.contato_id,
          nome: c.nome,
          detalhe: [c.setor, c.pessoa_nome].filter(Boolean).join(' — '),
          fone: c.fone,
          ...(await destino(c.fone)),
        });
      }
      // Quem dá para chamar primeiro (pessoas e contatos juntos); sem número (ou sem DDD) vai para o fim
      lista.sort((a, b) => Number(!a.telefone) - Number(!b.telefone));
      // Só dígitos: o próprio número digitado, mesmo sem cadastro
      if (digitos.length >= 10 && digitos.length === busca.replace(/[\s()+-]/g, '').length) {
        try {
          lista.unshift({ tipo: 'numero', pessoa_id: null, contato_id: null, nome: 'Número digitado', detalhe: null, fone: busca, telefone: await numeroDaConversa(emp, telefoneWhatsApp(digitos)), aviso: null });
        } catch {
          // número inválido: fica só o que achou no cadastro
        }
      }
      res.json(lista);
    } catch (err: any) {
      falha(res, err);
    }
  });

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
        `SELECT w.telefone, x.pessoa_id, p.nome, x.contato_id, c.nome AS contato_nome, COALESCE(c.departamento, c.cargo) AS contato_setor,
                ${NOME_CONTATO('w')} AS nome_contato, w.direcao, w.tipo, w.texto, w.arquivo_nome, w.situacao,
                DATE_FORMAT(w.data_hora, '%Y-%m-%d %H:%i:%s') AS data_hora, x.nao_vistas
           FROM (SELECT telefone, MAX(id) AS ultima, MAX(pessoa_id) AS pessoa_id, MAX(contato_id) AS contato_id,
                        SUM(direcao = 'recebida' AND vista = 0) AS nao_vistas
                   FROM whatsapp_mensagens WHERE empresa_id = ? GROUP BY telefone) x
           JOIN whatsapp_mensagens w ON w.id = x.ultima
           LEFT JOIN pessoas p ON p.id = x.pessoa_id
           LEFT JOIN pessoas_contatos c ON c.id = x.contato_id
          WHERE (? = '' OR p.nome LIKE ? OR c.nome LIKE ? OR ${NOME_CONTATO('w')} LIKE ? OR (? <> '' AND w.telefone LIKE ?))
          ORDER BY w.data_hora DESC, w.id DESC
          LIMIT 200`,
        [res.locals.empresaId, busca, `%${busca}%`, `%${busca}%`, `%${busca}%`, digitos, `%${digitos}%`],
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
        `SELECT MAX(w.pessoa_id) AS pessoa_id, MAX(w.contato_id) AS contato_id, ${NOME_CONTATO('w')} AS nome_contato
           FROM whatsapp_mensagens w WHERE w.empresa_id = ? AND w.telefone = ?
          GROUP BY w.empresa_id, w.telefone`,
        [emp, telefone],
      );
      let pessoaId: number | null = ult[0]?.pessoa_id ?? null;
      let contatoId: number | null = ult[0]?.contato_id ?? null;
      if (!pessoaId) {
        ({ pessoa_id: pessoaId, contato_id: contatoId } = await donoDoTelefone(emp, telefone));
        if (pessoaId) {
          await pool.query('UPDATE whatsapp_mensagens SET pessoa_id = ?, contato_id = ? WHERE empresa_id = ? AND telefone = ? AND pessoa_id IS NULL', [pessoaId, contatoId, emp, telefone]);
        }
      }
      await pool.query("UPDATE whatsapp_mensagens SET vista = 1 WHERE empresa_id = ? AND telefone = ? AND direcao = 'recebida' AND vista = 0", [emp, telefone]);
      const [mensagens] = await pool.query<any[]>(
        `SELECT * FROM (
           SELECT w.id, w.direcao, w.tipo, w.texto, w.arquivo_nome, w.situacao, u.nome AS usuario_nome,
                  (w.disparo_id IS NOT NULL) AS campanha, (w.origem IS NOT NULL) AS automatica, w.erro, DATE_FORMAT(w.data_hora, '%Y-%m-%d %H:%i:%s') AS data_hora
             FROM whatsapp_mensagens w LEFT JOIN usuarios u ON u.id = w.usuario_id
            WHERE w.empresa_id = ? AND w.telefone = ?
            ORDER BY w.data_hora DESC, w.id DESC LIMIT 300) m
          ORDER BY m.data_hora, m.id`,
        [emp, telefone],
      );
      const [pessoa] = pessoaId ? await pool.query<any[]>('SELECT id, nome FROM pessoas WHERE id = ? AND empresa_id = ?', [pessoaId, emp]) : [[]];
      const [contato] = contatoId
        ? await pool.query<any[]>('SELECT id, nome, cargo, departamento FROM pessoas_contatos WHERE id = ? AND empresa_id = ?', [contatoId, emp])
        : [[]];
      res.json({ pessoa: pessoa[0] ?? null, contato: contato[0] ?? null, nome_contato: ult[0]?.nome_contato ?? null, mensagens: mensagens.map((m) => ({ ...m, campanha: Boolean(m.campanha), automatica: Boolean(m.automatica) })) });
    } catch (err: any) {
      falha(res, err);
    }
  });

  /**
   * Responde pela tela: texto enviado pelo WhatsApp da empresa, registrado com o usuário. Devolve o
   * número da conversa (pode vir sem o 9) e se concluiu a atividade que abriu a conversa
   */
  router.post('/whatsapp/conversas/:telefone', async (req: Request, res: Response) => {
    try {
      const emp = res.locals.empresaId;
      const telefone = req.params.telefone;
      if (!TELEFONE.test(telefone)) return res.status(400).json({ error: 'Telefone inválido.' });
      const texto = String(req.body?.texto ?? '').trim();
      if (!texto) return res.status(400).json({ error: 'Digite a mensagem.' });
      if (texto.length > 4000) return res.status(400).json({ error: 'Mensagem grande demais (máximo de 4.000 caracteres).' });
      const [ult] = await pool.query<any[]>(
        'SELECT MAX(pessoa_id) AS pessoa_id, MAX(contato_id) AS contato_id FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ?',
        [emp, telefone],
      );
      const numero = await enviarWhatsApp(emp, telefone, texto, {
        pessoa_id: ult[0]?.pessoa_id ?? null,
        contato_id: ult[0]?.contato_id ?? null,
        usuario_id: res.locals.usuarioId,
      });
      // Conversa aberta pela atividade WhatsApp: a mensagem enviada conclui a atividade
      let concluida = false;
      const atividadeId = Number(req.body?.atividade_id) || null;
      if (atividadeId) {
        const [r] = await pool.query<any>(
          'UPDATE atividades SET concluida = 1, concluida_em = COALESCE(concluida_em, NOW()) WHERE id = ? AND empresa_id = ? AND concluida = 0',
          [atividadeId, emp],
        );
        concluida = r.affectedRows > 0;
        if (concluida) {
          const [a] = await pool.query<any[]>('SELECT negocio_id FROM atividades WHERE id = ?', [atividadeId]);
          if (a[0]?.negocio_id) await sincronizarNegocio(a[0].negocio_id);
        }
      }
      res.json({ success: true, telefone: numero, atividade_concluida: concluida });
    } catch (err: any) {
      falha(res, err);
    }
  });

  return router;
}
