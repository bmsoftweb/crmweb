import nodemailer from 'nodemailer';
import { lerConfig } from './config';
import { cifrar, decifrar, textoConfig } from './segredo';

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

/** Transporte e remetente da empresa: a configuração da tela, ou o .env */
async function transporteDa(empresaId: string) {
  const cfg: ConfigSmtp | null = await lerConfig(empresaId, 'email', 'smtp');
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

export async function enviarEmail(
  empresaId: string,
  msg: { para: string; assunto: string; texto: string; anexos?: { nome: string; conteudo: Buffer }[] },
) {
  const { transporte, from } = await transporteDa(empresaId);
  await transporte.sendMail({
    from,
    to: msg.para,
    subject: msg.assunto,
    text: msg.texto,
    attachments: msg.anexos?.map((a) => ({ filename: a.nome, content: a.conteudo })),
  });
}

/** Conecta e autentica, sem enviar nada */
export async function testarSmtp(empresaId: string) {
  const { transporte } = await transporteDa(empresaId);
  try {
    await transporte.verify();
  } catch (err: any) {
    throw new Error(`E-mail: ${err.code === 'EAUTH' ? 'usuário ou senha recusados pelo servidor' : err.message} (${err.response || err.code || ''}).`);
  }
}
