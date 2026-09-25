import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool, checkDbHealth } from './db.js';
import { createCrudRouter } from './crud.js';
import { createCrmRouter } from './crm.js';
import { createImportBmRouter } from './importbm.js';
import { createConfigRouter } from './config.js';
import { createImportArquivoRouter } from './importarquivo.js';
import { createEnderecosRouter } from './enderecos.js';
import { createParticipantesRouter } from './participantes.js';
import { createCampanhasRouter } from './campanhas.js';
import { createConversasRouter } from './conversas.js';
import { createContratosRouter, createWebhookD4SignRouter, rotinaContratos } from './contratos.js';
import { enviarPendentes, receberAvisoEvolution } from './whatsapp.js';

// ==========================================================
// Sessão: token "usuarioId.expiracao.assinatura" (HMAC-SHA256)
// ==========================================================
const SEGREDO =
  process.env.SESSION_SECRET ||
  (console.warn('SESSION_SECRET não definido: as sessões expiram a cada reinício do servidor.'),
  crypto.randomBytes(32).toString('hex'));
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

const assinar = (dados: string) => crypto.createHmac('sha256', SEGREDO).update(dados).digest('base64url');

function emitirToken(usuarioId: number): string {
  const dados = `${usuarioId}.${Date.now() + VALIDADE_MS}`;
  return `${dados}.${assinar(dados)}`;
}

/** Id do usuário do token, ou null se inválido/expirado */
function lerToken(token: string): number | null {
  const [id, exp, assinatura] = String(token || '').split('.');
  if (!id || !exp || !assinatura) return null;
  const esperada = assinar(`${id}.${exp}`);
  if (esperada.length !== assinatura.length || !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(assinatura))) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(id);
}

/** Validação de senha tolerante a bases legadas: bcrypt, texto puro, MD5, SHA-256 e SHA-1 */
function verifyPasswordMatch(inputPassword: string, storedHash: string): boolean {
  if (!storedHash || storedHash.trim() === '') return false;
  if (/^\$2[aby]\$/.test(storedHash)) {
    try {
      if (bcrypt.compareSync(inputPassword, storedHash)) return true;
    } catch {
      // segue para os demais formatos
    }
  }
  if (inputPassword === storedHash) return true;
  for (const alg of ['md5', 'sha256', 'sha1']) {
    if (crypto.createHash(alg).update(inputPassword).digest('hex') === storedHash.toLowerCase()) return true;
  }
  return false;
}

const usuarioPublico = (u: any) => ({
  id: String(u.id),
  nome: u.nome,
  email: u.email,
  cargo: u.cargo || (u.tipo === 'admin' ? 'Administrador' : 'Vendedor'),
  tipo: u.tipo,
});

/**
 * Usuário ativo + a empresa (tenant) a que pertence. usuarios.empresa_id é numérico e
 * empresas.id é VARCHAR: a comparação é feita como texto.
 */
const SQL_USUARIO_EMPRESA = `
  SELECT u.id, u.tipo, u.nome, u.email, u.senha_hash, u.cargo, e.id AS empresa_id, e.nome AS empresa_nome
    FROM usuarios u
    JOIN empresas e ON e.id = CAST(u.empresa_id AS CHAR)
   WHERE u.ativo = 1`;

/** App Express com todas as rotas /api. Local: server.ts adiciona o Vite e o listen; Vercel: api/index.ts */
export function createApp() {
  const app = express();
  // Documentos de contrato (PDF em base64) passam do limite normal de 2 MB
  const jsonNormal = express.json({ limit: '2mb' });
  const jsonDocumentos = express.json({ limit: '25mb' });
  app.use((req, res, next) => (/^\/api\/contratos\/\d+\/documentos$/.test(req.path) ? jsonDocumentos : jsonNormal)(req, res, next));

  // ==========================================================
  // 0. Login por e-mail (ou nome) + senha
  // ==========================================================
  app.post('/api/login', async (req: Request, res: Response) => {
    try {
      const { email, senha } = req.body || {};
      const login = String(email || '').trim().toLowerCase();
      const passwordInput = typeof senha === 'string' ? senha : '';
      if (!login) return res.status(400).json({ success: false, error: 'Informe o seu e-mail.' });

      const [rows] = await pool.query<any[]>(
        `${SQL_USUARIO_EMPRESA} AND (LOWER(TRIM(u.email)) = ? OR LOWER(TRIM(u.nome)) = ?) LIMIT 1`,
        [login, login],
      );
      if (!rows.length) {
        return res.status(401).json({
          success: false,
          error: `O usuário "${login}" não foi localizado, está inativo ou não tem empresa cadastrada.`,
        });
      }
      const u = rows[0];

      // Senha em branco no banco = primeiro acesso: grava o que foi digitado em bcrypt
      const senhaEmBranco = !u.senha_hash || String(u.senha_hash).trim() === '' || String(u.senha_hash).toUpperCase() === 'NULL';
      let primeiroAcesso = false;
      if (senhaEmBranco) {
        if (passwordInput.trim().length < 4) {
          return res.status(401).json({ success: false, error: 'Primeiro acesso: defina uma senha com pelo menos 4 caracteres.' });
        }
        await pool.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [bcrypt.hashSync(passwordInput, 10), u.id]);
        primeiroAcesso = true;
      } else {
        if (!verifyPasswordMatch(passwordInput, u.senha_hash)) {
          return res.status(401).json({ success: false, error: 'Senha incorreta para o usuário informado.' });
        }
        // Reescreve senhas em formato legado no padrão bcrypt
        if (!/^\$2[aby]\$/.test(String(u.senha_hash))) {
          await pool.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [bcrypt.hashSync(passwordInput, 10), u.id]).catch(() => {});
        }
      }

      res.json({
        success: true,
        primeiroAcesso,
        message: primeiroAcesso ? 'Primeiro acesso: sua senha foi registrada e criptografada com bcrypt.' : undefined,
        token: emitirToken(Number(u.id)),
        usuario: usuarioPublico(u),
        empresa: { id: String(u.empresa_id), nome: u.empresa_nome },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/db/status', async (_req: Request, res: Response) => {
    res.json(await checkDbHealth());
  });

  // Aviso da D4Sign sobre as assinaturas (público: a D4Sign não tem sessão)
  app.use(createWebhookD4SignRouter());

  // Avisos da Evolution (mensagens recebidas, entrega e leitura). Público: o token do endereço
  // identifica a empresa. Processa antes de responder (na Vercel a função congela depois)
  app.post('/api/webhooks/evolution/:token', async (req: Request, res: Response) => {
    try {
      await receberAvisoEvolution(req.params.token, req.body);
      res.json({ ok: true });
    } catch (err: any) {
      if (!err.status) console.error(`Evolution webhook: ${err.message}`);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Rotinas chamadas pelo cron da Vercel (vercel.json), que envia "Authorization: Bearer CRON_SECRET".
  // Fora da Vercel elas rodam pelo setInterval do server.ts.
  const cron = (tarefa: () => Promise<unknown>) => async (req: Request, res: Response) => {
    const segredo = process.env.CRON_SECRET;
    const recebido = String(req.header('authorization') || '');
    const esperado = `Bearer ${segredo}`;
    if (!segredo || recebido.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    try {
      res.json({ success: true, resultado: await tarefa() });
    } catch (err: any) {
      console.error(`Cron ${req.path}: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  };
  // A função tem até 60 s: o envio para em 45 s e o resto fica para o minuto seguinte
  app.get('/api/cron/whatsapp', cron(() => enviarPendentes(50, 45_000)));
  app.get('/api/cron/contratos', cron(rotinaContratos));

  // ==========================================================
  // Daqui para baixo, toda rota /api exige um token válido
  // ==========================================================
  // A empresa vem sempre do cadastro do usuário (nunca do navegador), relida a cada
  // requisição: usuário desativado ou trocado de empresa perde o acesso na hora.
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    const token = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    const usuarioId = lerToken(token);
    if (!usuarioId) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    try {
      const [rows] = await pool.query<any[]>(`${SQL_USUARIO_EMPRESA} AND u.id = ? LIMIT 1`, [usuarioId]);
      if (!rows.length) {
        return res.status(401).json({ valida: false, error: 'Seu usuário foi desativado ou está sem empresa. Fale com o administrador.' });
      }
      res.locals.usuarioId = usuarioId;
      res.locals.usuario = rows[0];
      res.locals.empresaId = String(rows[0].empresa_id);
      next();
    } catch (err: any) {
      // Falha de banco não derruba a sessão: o painel já mostra o banco como indisponível
      res.status(503).json({ valida: null, error: err.message });
    }
  });

  /** Revalidação da sessão guardada no navegador (a checagem em si é o middleware acima) */
  app.get('/api/sessao', (_req: Request, res: Response) => {
    const u = res.locals.usuario;
    res.json({ valida: true, usuario: usuarioPublico(u), empresa: { id: String(u.empresa_id), nome: u.empresa_nome } });
  });

  // Preferências das listas (larguras e ordem das colunas), guardadas por usuário
  app.get('/api/config-listas', async (_req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>('SELECT config_listas FROM usuarios WHERE id = ?', [res.locals.usuarioId]);
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(rows[0]?.config_listas || '{}') || {};
      } catch {
        // conteúdo inválido no banco não impede o painel de abrir
      }
      res.json(config);
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  app.put('/api/config-listas', async (req: Request, res: Response) => {
    const corpo = req.body;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
      return res.status(400).json({ error: 'Configuração inválida.' });
    }
    const texto = JSON.stringify(corpo);
    if (texto.length > 60000) return res.status(413).json({ error: 'Configuração muito grande.' });
    try {
      await pool.query('UPDATE usuarios SET config_listas = ? WHERE id = ?', [texto, res.locals.usuarioId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  // Cadastro de usuários: só administradores (um vendedor não pode se promover)
  app.use('/api/crud/usuarios', (_req: Request, res: Response, next: NextFunction) => {
    if (res.locals.usuario.tipo !== 'admin') return res.status(403).json({ error: 'Somente administradores gerenciam usuários.' });
    next();
  });

  app.use('/api', createConfigRouter());
  app.use('/api', createImportBmRouter());
  app.use('/api', createImportArquivoRouter());
  app.use('/api', createEnderecosRouter());
  app.use('/api', createParticipantesRouter());
  app.use('/api', createCampanhasRouter());
  app.use('/api', createConversasRouter());
  app.use('/api', createContratosRouter());
  app.use('/api', createCrmRouter());
  app.use('/api', createCrudRouter());

  return app;
}
