import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { lerConfig } from './config.js';
import { cifrar, decifrar, textoConfig } from './segredo.js';

/**
 * Envio de e-mail por SMTP.
 *
 * A configuração vem de Configurações › E-mail (tabela config, grupo "email", chave
 * "smtp"), por empresa. Empresa sem configuração usa o .env, com os mesmos nomes dos
 * outros projetos (meuConsultorioWeb, comprasWeb, myPlanner):
 *   SMTP_HOST, SMTP_PORT (padrão 587), SMTP_USER, SMTP_PASS (ou SMTP_PASSWORD),
 *   SMTP_FROM (padrão: o usuário), SMTP_SECURE=true para SSL direto (sem ela, só na 465)
 */

/** Como fica no banco. A senha nunca vai em texto: só cifrada, e nunca volta para o navegador */
interface ConfigSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  senha_cifrada?: string;
  /** Leitura das respostas (pesquisa de satisfação por e-mail): servidor IMAP, com o mesmo usuário e senha */
  imap_host?: string;
  imap_port?: number;
}

/**
 * Valor que veio da tela → o que vai para o banco. Senha em branco mantém a gravada;
 * servidor em branco apaga a configuração (volta a valer o .env).
 */
export function prepararConfigSmtp(valor: any, anterior: ConfigSmtp | null): ConfigSmtp | null {
  const host = textoConfig(valor?.host, 255, 'E-mail: servidor');
  if (!host) return null;
  const port = Number(valor?.port) || 587;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('E-mail: porta inválida.');
  const senha = String(valor?.senha ?? '');
  if (senha.length > 200) throw new Error('E-mail: senha grande demais.');
  const cfg: ConfigSmtp = {
    host,
    port,
    secure: Boolean(valor?.secure),
    user: textoConfig(valor?.user, 255, 'E-mail: usuário'),
    from: textoConfig(valor?.from, 255, 'E-mail: remetente'),
  };
  const imapHost = textoConfig(valor?.imap_host, 255, 'E-mail: servidor IMAP');
  if (imapHost) {
    const imapPort = Number(valor?.imap_port) || 993;
    if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) throw new Error('E-mail: porta IMAP inválida.');
    cfg.imap_host = imapHost;
    cfg.imap_port = imapPort;
  }
  const senhaCifrada = senha ? cifrar(senha) : anterior?.senha_cifrada;
  if (senhaCifrada) cfg.senha_cifrada = senhaCifrada;
  return cfg;
}

/** Valor do banco → o que a tela recebe (sem a senha) */
export function configSmtpPublica(cfg: ConfigSmtp | null) {
  if (!cfg) return null;
  const { senha_cifrada, ...resto } = cfg;
  return { ...resto, senha_definida: Boolean(senha_cifrada) };
}

/** Conta de e-mail: comercial (propostas, pedidos, contratos, campanhas) ou do suporte (pesquisa de satisfação, chamados) */
export type ContaEmail = 'comercial' | 'suporte';

/** Configuração da conta; a do suporte sem servidor preenchido usa a comercial */
async function configDa(empresaId: string, conta: ContaEmail): Promise<ConfigSmtp | null> {
  const suporte: ConfigSmtp | null = conta === 'suporte' ? await lerConfig(empresaId, 'email', 'smtp_suporte') : null;
  return suporte?.host ? suporte : lerConfig(empresaId, 'email', 'smtp');
}

/** Transporte e remetente da empresa: a configuração da tela, ou o .env */
async function transporteDa(empresaId: string, conta: ContaEmail = 'comercial') {
  const cfg: ConfigSmtp | null = await configDa(empresaId, conta);
  let host: string | undefined, port: number, secure: boolean, user: string | undefined, pass: string | undefined, from: string | undefined;
  if (cfg?.host) {
    ({ host, port, secure, user, from } = cfg);
    pass = cfg.senha_cifrada ? decifrar(cfg.senha_cifrada, 'Configurações › E-mail') : undefined;
  } else {
    host = process.env.SMTP_HOST;
    port = Number(process.env.SMTP_PORT) || 587;
    const s = process.env.SMTP_SECURE;
    secure = s ? s === 'true' || s === '1' : port === 465;
    user = process.env.SMTP_USER;
    pass = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
    from = process.env.SMTP_FROM;
  }
  if (!host) throw new Error('E-mail não configurado: preencha Configurações › E-mail.');
  const transporte = nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
  return { transporte, from: from || user };
}

/** Envia; devolve o Message-ID (a resposta do cliente aponta para ele no In-Reply-To) */
export async function enviarEmail(
  empresaId: string,
  msg: { para: string; assunto: string; texto: string; anexos?: { nome: string; conteudo: Buffer }[] },
  conta: ContaEmail = 'comercial',
): Promise<string | null> {
  const { transporte, from } = await transporteDa(empresaId, conta);
  const info = await transporte.sendMail({
    from,
    to: msg.para,
    subject: msg.assunto,
    text: msg.texto,
    attachments: msg.anexos?.map((a) => ({ filename: a.nome, content: a.conteudo })),
  });
  return info.messageId ?? null;
}

/** E-mail recebido, já lido: quem mandou, assunto, a mensagem a que responde e o texto */
export interface EmailRecebido {
  de: string;
  assunto: string;
  emRespostaA: string[];
  texto: string;
}

/**
 * Lê a caixa de entrada (IMAP de Configurações › E-mail) procurando respostas: e-mails não lidos dos últimos dias
 * cujo assunto tem o código ou que respondem a uma das mensagens enviadas. aceitar decide (e trata) cada um; os
 * aceitos ficam marcados como lidos. Sem IMAP configurado: não faz nada (null)
 */
export async function lerRespostas(
  empresaId: string,
  dias: number,
  aceitar: (e: EmailRecebido) => Promise<boolean>,
  conta: ContaEmail = 'comercial',
): Promise<number | null> {
  const cfg = await configDa(empresaId, conta);
  if (!cfg?.imap_host || !cfg.user || !cfg.senha_cifrada) return null;
  const cliente = new ImapFlow({
    host: cfg.imap_host,
    port: cfg.imap_port || 993,
    secure: (cfg.imap_port || 993) === 993,
    auth: { user: cfg.user, pass: decifrar(cfg.senha_cifrada, 'Configurações › E-mail') },
    logger: false,
  });
  await cliente.connect();
  let aceitos = 0;
  const trava = await cliente.getMailboxLock('INBOX');
  try {
    const desde = new Date(Date.now() - dias * 86_400_000);
    const uids = (await cliente.search({ seen: false, since: desde }, { uid: true })) || [];
    for (const uid of uids) {
      const m = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
      if (!m || !m.source) continue;
      const e = await simpleParser(m.source);
      const recebido: EmailRecebido = {
        de: e.from?.value?.[0]?.address ?? '',
        assunto: e.subject ?? '',
        emRespostaA: [e.inReplyTo, ...(Array.isArray(e.references) ? e.references : e.references ? [e.references] : [])].filter(Boolean) as string[],
        texto: String(e.text ?? '').trim(),
      };
      if (await aceitar(recebido)) {
        await cliente.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        aceitos++;
      }
    }
  } finally {
    trava.release();
    await cliente.logout().catch(() => {});
  }
  return aceitos;
}

/** Conecta e autentica, sem enviar nada */
export async function testarSmtp(empresaId: string, conta: ContaEmail = 'comercial') {
  const { transporte } = await transporteDa(empresaId, conta);
  try {
    await transporte.verify();
  } catch (err: any) {
    throw new Error(`E-mail: ${err.code === 'EAUTH' ? 'usuário ou senha recusados pelo servidor' : err.message} (${err.response || err.code || ''}).`);
  }
}
