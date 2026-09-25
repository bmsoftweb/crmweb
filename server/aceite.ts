import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { lerConfig } from './config.js';
import { aprovarProposta, lerDocumento, registrarHistorico } from './crm.js';
import { sincronizarNegocio } from './regras.js';
import { gerarPdf } from './pdf.js';
import { htmlDocumento } from '../src/utils/imprimirDocumento.js';
import { enviarAutomatica, telefoneWhatsApp } from './whatsapp.js';

/**
 * Aceite da proposta pelo link (sem login): ao enviar a proposta, a mensagem leva o link
 * /p/<token>; o cliente vê número, itens e valores, e aprova (nome, CPF/CNPJ e assinatura
 * desenhada) ou recusa (motivo). Fica gravado nas colunas aceite_* da proposta: data/hora,
 * IP, navegador, a assinatura (PNG) e o hash do conteúdo aprovado. O dono do negócio é avisado.
 */

const TOKEN_OK = /^[A-Za-z0-9_-]{20,64}$/;

function erro(status: number, msg: string) {
  return Object.assign(new Error(msg), { status });
}

/** Endereço público do CRM: o do recebimento do WhatsApp, o da D4Sign ou o da própria requisição */
async function urlPublica(emp: string, req: Request): Promise<string> {
  const w: any = await lerConfig(emp, 'whatsapp', 'provedor');
  const d: any = await lerConfig(emp, 'assinatura', 'd4sign');
  const daReq = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
  return String(w?.webhook?.origem || d?.url_publica || daReq).replace(/\/+$/, '');
}

/** Link de aceite da proposta (o token é criado no primeiro envio e não muda mais) */
export async function linkAceite(emp: string, propostaId: string | number, req: Request): Promise<string> {
  await pool.query('UPDATE propostas SET aceite_token = ? WHERE id = ? AND empresa_id = ? AND aceite_token IS NULL', [
    crypto.randomBytes(24).toString('base64url'),
    propostaId,
    emp,
  ]);
  const [r] = await pool.query<any[]>('SELECT aceite_token FROM propostas WHERE id = ? AND empresa_id = ?', [propostaId, emp]);
  if (!r[0]?.aceite_token) throw erro(404, 'Proposta não encontrada.');
  return `${await urlPublica(emp, req)}/p/${r[0].aceite_token}`;
}

export type Situacao = 'aberta' | 'aceita' | 'recusada' | 'vencida' | 'substituida' | 'fechada';

/** O que o cliente pode fazer com o link */
export function situacaoDoLink(p: { status: string; vencida: number | boolean; ultima_versao: number; versao: number }): Situacao {
  if (p.status === 'aceita') return 'aceita';
  if (p.status === 'fechada') return 'fechada';
  if (p.status === 'recusada') return Number(p.ultima_versao) > Number(p.versao) ? 'substituida' : 'recusada';
  if (Number(p.ultima_versao) > Number(p.versao)) return 'substituida';
  if (p.status === 'expirada' || Number(p.vencida)) return 'vencida';
  return 'aberta';
}

/** Proposta do token (com os itens) e a situação do link */
async function doToken(token: string) {
  if (!TOKEN_OK.test(token)) throw erro(404, 'Link inválido.');
  const [r] = await pool.query<any[]>(
    `SELECT id, empresa_id, (data_validade < CURDATE()) AS vencida,
            (SELECT MAX(x.versao) FROM propostas x WHERE x.empresa_id = t.empresa_id AND x.numero_proposta = t.numero_proposta) AS ultima_versao
       FROM propostas t WHERE aceite_token = ?`,
    [token],
  );
  if (!r.length) throw erro(404, 'Link inválido ou proposta excluída.');
  const emp = String(r[0].empresa_id);
  const p = await lerDocumento('proposta', String(r[0].id), emp);
  return { emp, p, situacao: situacaoDoLink({ ...p, vencida: r[0].vencida, ultima_versao: r[0].ultima_versao }) };
}

/** Impressão digital do que foi aprovado: número, versão, valores, condições e itens */
export function hashConteudo(p: any): string {
  const conteudo = {
    numero: p.numero_proposta,
    versao: p.versao,
    subtotal: Number(p.valor_subtotal),
    desconto: Number(p.valor_desconto),
    total: Number(p.valor_total),
    validade: p.data_validade,
    condicoes: p.condicoes_pagamento ?? null,
    itens: (p.itens || []).map((i: any) => [i.produto_id, Number(i.quantidade), Number(i.preco_unitario), Number(i.desconto), Number(i.subtotal)]),
  };
  return crypto.createHash('sha256').update(JSON.stringify(conteudo)).digest('hex');
}

/** Só dígitos; CPF (11) ou CNPJ (14) */
export function documentoValido(doc: string): boolean {
  const d = doc.replace(/\D/g, '');
  return d.length === 11 || d.length === 14;
}

/** Aviso ao dono do negócio pelo WhatsApp (sem telefone no cadastro, fica só o histórico) */
async function avisarDono(emp: string, p: any, origem: string, texto: string) {
  const [u] = await pool.query<any[]>(
    `SELECT u.telefone FROM negocios n JOIN usuarios u ON u.id = n.proprietario_id
      WHERE n.id = ? AND n.empresa_id = ? AND u.ativo = 1 AND u.telefone <> ''`,
    [p.negocio_id, emp],
  );
  if (!u[0]) return;
  try {
    await enviarAutomatica(emp, origem, null, telefoneWhatsApp(u[0].telefone), texto);
  } catch (err: any) {
    console.error(`Aceite: aviso ao dono da proposta ${p.id}: ${err.message}`);
  }
}

const ip = (req: Request) => String(req.get('x-forwarded-for')?.split(',')[0] || req.socket.remoteAddress || '').trim().slice(0, 45);
const navegador = (req: Request) => String(req.get('user-agent') || '').slice(0, 255);

export function createAceiteRouter() {
  const router = Router();
  const rota =
    (fn: (req: Request, res: Response) => Promise<any>) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (err: any) {
        if (!err.status) console.error(`Aceite: ${err.message}`);
        res.status(err.status || 500).json({ error: err.status ? err.message : 'Não foi possível concluir agora. Tente de novo em instantes.' });
      }
    };

  /** Dados da proposta para a tela do cliente (sem e-mail, telefone ou documento do cadastro) */
  router.get('/api/publico/propostas/:token', rota(async (req, res) => {
    const { p, situacao } = await doToken(req.params.token);
    res.json({
      situacao,
      numero: p.numero_proposta,
      versao: p.versao,
      titulo: p.titulo,
      cliente: p.pessoa_nome ?? null,
      empresa: { nome: p.empresa_nome, cnpj: p.empresa_cnpj, endereco: p.empresa_endereco, logo: p.empresa_logo },
      data_validade: p.data_validade,
      condicoes_pagamento: p.condicoes_pagamento,
      observacoes: p.observacoes,
      valor_subtotal: Number(p.valor_subtotal),
      valor_desconto: Number(p.valor_desconto),
      valor_total: Number(p.valor_total),
      itens: p.itens.map((i: any) => ({
        produto: i.produto_nome,
        unidade: i.unidade_medida,
        quantidade: Number(i.quantidade),
        preco_unitario: Number(i.preco_unitario),
        desconto: Number(i.desconto),
        subtotal: Number(i.subtotal),
      })),
      decisao: p.aceite_em ? { nome: p.aceite_nome, em: p.aceite_em } : null,
    });
  }));

  router.get('/api/publico/propostas/:token/pdf', rota(async (req, res) => {
    const { p } = await doToken(req.params.token);
    const pdf = await gerarPdf(htmlDocumento(p, 'propostas'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Proposta ${p.numero_proposta}-v${p.versao}.pdf"`);
    res.send(pdf);
  }));

  router.post('/api/publico/propostas/:token/aceitar', rota(async (req, res) => {
    const { emp, p, situacao } = await doToken(req.params.token);
    if (situacao !== 'aberta') throw erro(409, 'Esta proposta não está mais disponível para aprovação.');
    const nome = String(req.body?.nome ?? '').trim().slice(0, 150);
    const documento = String(req.body?.documento ?? '').replace(/\D/g, '');
    const assinatura = String(req.body?.assinatura ?? '');
    if (nome.length < 3) throw erro(400, 'Informe o seu nome completo.');
    if (!documentoValido(documento)) throw erro(400, 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(assinatura) || assinatura.length > 800_000) throw erro(400, 'Faça a sua assinatura no quadro.');
    if (req.body?.concordo !== true) throw erro(400, 'Marque que leu e aprova a proposta.');

    // Reserva o aceite (dois cliques ao mesmo tempo: só um passa)
    const [r] = await pool.query<any>(
      `UPDATE propostas SET aceite_em = NOW(), aceite_nome = ?, aceite_documento = ?, aceite_ip = ?, aceite_navegador = ?, aceite_assinatura = ?, aceite_hash = ?
        WHERE id = ? AND aceite_em IS NULL AND status NOT IN ('aceita', 'recusada', 'fechada', 'expirada')`,
      [nome, documento, ip(req), navegador(req), assinatura, hashConteudo(p), p.id],
    );
    if (!r.affectedRows) throw erro(409, 'Esta proposta já foi respondida.');
    let pedido;
    try {
      pedido = await aprovarProposta(emp, String(p.id), `aprovada e assinada pelo cliente no link (${nome}, ${documento})`);
    } catch (err: any) {
      await pool.query(
        'UPDATE propostas SET aceite_em = NULL, aceite_nome = NULL, aceite_documento = NULL, aceite_ip = NULL, aceite_navegador = NULL, aceite_assinatura = NULL, aceite_hash = NULL WHERE id = ?',
        [p.id],
      );
      throw erro(409, err.message);
    }
    await avisarDono(
      emp,
      p,
      `aceite:${p.id}`,
      `✅ A proposta nº ${p.numero_proposta} v${p.versao} (${p.titulo}) foi *aprovada e assinada* pelo cliente ${nome}. Pedido nº ${pedido.numeroPedido} gerado.`,
    );
    res.json({ success: true });
  }));

  router.post('/api/publico/propostas/:token/recusar', rota(async (req, res) => {
    const { emp, p, situacao } = await doToken(req.params.token);
    if (situacao !== 'aberta') throw erro(409, 'Esta proposta não está mais disponível.');
    const nome = String(req.body?.nome ?? '').trim().slice(0, 150);
    const motivo = String(req.body?.motivo ?? '').trim().slice(0, 1000);
    if (nome.length < 3) throw erro(400, 'Informe o seu nome.');
    if (!motivo) throw erro(400, 'Conte o motivo da recusa: ajuda a gente a melhorar a proposta.');
    const [r] = await pool.query<any>(
      `UPDATE propostas SET status = 'recusada', aceite_em = NOW(), aceite_nome = ?, aceite_ip = ?, aceite_navegador = ?
        WHERE id = ? AND aceite_em IS NULL AND status NOT IN ('aceita', 'recusada', 'fechada', 'expirada')`,
      [nome, ip(req), navegador(req), p.id],
    );
    if (!r.affectedRows) throw erro(409, 'Esta proposta já foi respondida.');
    await registrarHistorico(pool, emp, {
      negocio_id: p.negocio_id,
      proposta_id: p.id,
      pessoa_id: p.pessoa_id,
      descricao: `Proposta #${p.numero_proposta} v${p.versao} recusada pelo cliente no link (${nome}). Motivo: ${motivo}`,
    });
    await sincronizarNegocio(p.negocio_id);
    await avisarDono(emp, p, `recusa:${p.id}`, `❌ A proposta nº ${p.numero_proposta} v${p.versao} (${p.titulo}) foi *recusada* pelo cliente ${nome}. Motivo: ${motivo}`);
    res.json({ success: true });
  }));

  return router;
}
