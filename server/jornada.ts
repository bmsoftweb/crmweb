import dns from 'node:dns/promises';
import net from 'node:net';
import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { lerConfig, somenteAdmin } from './config.js';
import { cifrar, decifrar } from './segredo.js';
import { chaveTelefone, donoDoTelefone, enviarReservada, mostrarDigitando, reservarEnvio, type ArquivoEnvio, type MensagemNova } from './whatsapp.js';
import {
  avisarDepartamento,
  escolhaDoTexto,
  escolhaPelaIa,
  gerarRespostaIa,
  lerChatbot,
  minutosDevolver,
  mudarAtendimento,
  registrarLead,
  telefoneCadastro,
  type ConfigChatbot,
  type Contexto,
  type OpcaoMenu,
} from './chatbot.js';

/**
 * Jornada de atendimento do WhatsApp (Configurações › Jornada): um fluxo de nós ligados, desenhado
 * na tela. A conversa guarda em que nó está (whatsapp_conversas.no_atual), as respostas coletadas
 * (variaveis) e, no nó Esperar, quando continuar (retomar_em, retomado pelo cron a cada minuto).
 * Nós que esperam o cliente: Menu, Pergunta, IA e Esperar (este, se "interromper" estiver ligado).
 * Ligada, a jornada atende no lugar do bot (modo teste: só os números da lista).
 */

const ONDE = 'Configurações › Jornada';
const MAX_NOS = 200;
/** Passos por mensagem: laço sem nó de espera (Mensagem → Mensagem → ...) para aqui */
const MAX_PASSOS = 50;
const MAX_ARQUIVO = 3 * 1024 * 1024;
/** Estado da conversa depois de um nó Fim (ou saída sem ligação) */
const FIM = '__fim';

export const TIPOS_NO = ['inicio', 'mensagem', 'imagem', 'menu', 'pergunta', 'condicao', 'case', 'esperar', 'api', 'ia', 'lead', 'departamento', 'fim'] as const;
export type TipoNo = (typeof TIPOS_NO)[number];

export interface No {
  id: string;
  tipo: TipoNo;
  x: number;
  y: number;
  dados: Record<string, any>;
}
export interface Ligacao {
  de: string;
  saida: string;
  para: string;
}
export interface Jornada {
  ativo: boolean;
  /** teste: só os números de numeros_teste passam pela jornada */
  modo: 'teste' | 'todos';
  numeros_teste: string[];
  nos: No[];
  ligacoes: Ligacao[];
}

/** Saídas de cada nó (a tela tem a mesma regra em src/utils/jornada.ts) */
export function saidasDoNo(no: Pick<No, 'tipo' | 'dados'>): string[] {
  switch (no.tipo) {
    case 'menu':
      return [...(no.dados.opcoes ?? []).map((o: any) => String(o.id)), 'invalida'];
    case 'condicao':
      return ['sim', 'nao'];
    case 'case':
      return [...(no.dados.casos ?? []).map((c: any) => String(c.id)), 'nenhum'];
    case 'api':
      return ['sucesso', 'erro'];
    case 'ia':
      return ['humano'];
    case 'departamento':
    case 'fim':
      return [];
    default:
      return ['proximo'];
  }
}

const VAZIA: Jornada = {
  ativo: false,
  modo: 'teste',
  numeros_teste: [],
  nos: [
    { id: 'inicio', tipo: 'inicio', x: 0, y: 0, dados: {} },
    { id: 'fim', tipo: 'fim', x: 0, y: 200, dados: {} },
  ],
  ligacoes: [{ de: 'inicio', saida: 'proximo', para: 'fim' }],
};

// ------------------------------------------------------------
// Gravação (tela → banco) e leitura (banco → tela)
// ------------------------------------------------------------

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const VARIAVEL = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const texto = (v: unknown, max: number) => String(v ?? '').slice(0, max);

/** Valor da tela → banco: confere a estrutura e cifra os cabeçalhos secretos das chamadas de API */
export function prepararJornada(valor: any, anterior: Jornada | null): Jornada {
  const nosBrutos: any[] = Array.isArray(valor?.nos) ? valor.nos : [];
  if (nosBrutos.length > MAX_NOS) throw new Error(`Jornada: no máximo ${MAX_NOS} nós.`);
  const nos: No[] = [];
  for (const n of nosBrutos) {
    const id = String(n?.id ?? '');
    if (!ID.test(id) || nos.some((x) => x.id === id)) throw new Error(`Jornada: nó com identificador inválido ou repetido ("${id}").`);
    if (!TIPOS_NO.includes(n?.tipo)) throw new Error(`Jornada: tipo de nó desconhecido ("${n?.tipo}").`);
    const no: No = { id, tipo: n.tipo, x: Number(n.x) || 0, y: Number(n.y) || 0, dados: prepararDados(n.tipo, n.dados ?? {}, id, anterior) };
    nos.push(no);
  }
  if (nos.filter((n) => n.tipo === 'inicio').length !== 1) throw new Error('Jornada: precisa ter exatamente um nó Início.');

  const ligacoes: Ligacao[] = [];
  for (const l of Array.isArray(valor?.ligacoes) ? valor.ligacoes : []) {
    const de = nos.find((n) => n.id === l?.de);
    const para = nos.find((n) => n.id === l?.para);
    const saida = String(l?.saida ?? '');
    if (!de || !para) throw new Error('Jornada: ligação com nó que não existe.');
    if (para.tipo === 'inicio') throw new Error('Jornada: nenhuma ligação pode chegar no Início.');
    if (!saidasDoNo(de).includes(saida)) throw new Error(`Jornada: a saída "${saida}" não existe no nó "${rotulo(de)}".`);
    if (ligacoes.some((x) => x.de === de.id && x.saida === saida)) throw new Error(`Jornada: a saída "${saida}" do nó "${rotulo(de)}" tem mais de uma ligação.`);
    ligacoes.push({ de: de.id, saida, para: para.id });
  }

  const numeros_teste: string[] = [];
  for (const t of Array.isArray(valor?.numeros_teste) ? valor.numeros_teste : []) {
    const d = String(t ?? '').replace(/\D/g, '');
    if (!d) continue;
    if (!chaveTelefone(d, d.length >= 12)) throw new Error(`Jornada: número de teste inválido ("${t}"). Use DDD + número.`);
    if (!numeros_teste.includes(d)) numeros_teste.push(d);
  }
  const modo = valor?.modo === 'todos' ? 'todos' : 'teste';
  const ativo = Boolean(valor?.ativo);
  if (ativo && modo === 'teste' && !numeros_teste.length) throw new Error('Jornada: no modo teste, informe pelo menos um número de teste.');
  return { ativo, modo, numeros_teste, nos, ligacoes };
}

const rotulo = (n: Pick<No, 'id' | 'tipo' | 'dados'>) => String(n.dados?.titulo || '').trim() || `${n.tipo} ${n.id}`;

function prepararDados(tipo: TipoNo, d: any, id: string, anterior: Jornada | null): Record<string, any> {
  const erro = (msg: string) => new Error(`Jornada, nó ${rotulo({ id, tipo, dados: d })}: ${msg}`);
  const base = { titulo: texto(d.titulo, 60) };
  const listaIds = (itens: any[], nome: string) => {
    const vistos = new Set<string>();
    for (const i of itens) {
      if (!ID.test(String(i?.id ?? '')) || vistos.has(String(i.id))) throw erro(`${nome} com identificador inválido.`);
      vistos.add(String(i.id));
    }
  };
  switch (tipo) {
    case 'mensagem':
    case 'fim':
      return { ...base, texto: texto(d.texto, 4000) };
    case 'imagem': {
      const arquivo_id = Number(d.arquivo_id) || null;
      const url = texto(d.url, 1000).trim();
      if (!arquivo_id && !/^https:\/\//i.test(url)) throw erro('escolha uma imagem ou informe um link https.');
      return { ...base, arquivo_id, arquivo_nome: texto(d.arquivo_nome, 150), url: arquivo_id ? '' : url, legenda: texto(d.legenda, 1000) };
    }
    case 'menu': {
      const opcoes = (Array.isArray(d.opcoes) ? d.opcoes : []).map((o: any) => ({ id: String(o?.id ?? ''), rotulo: texto(o?.rotulo, 80).trim() }));
      if (!opcoes.length || opcoes.length > 9) throw erro('o menu precisa ter de 1 a 9 opções.');
      if (opcoes.some((o: any) => !o.rotulo)) throw erro('toda opção precisa de um texto.');
      listaIds(opcoes, 'opção');
      return { ...base, texto: texto(d.texto, 1000), opcoes, invalida: texto(d.invalida, 500) };
    }
    case 'pergunta': {
      const variavel = String(d.variavel ?? '').trim();
      if (!VARIAVEL.test(variavel)) throw erro('informe a variável que guarda a resposta (letras, números e _).');
      if (!String(d.texto ?? '').trim()) throw erro('escreva a pergunta.');
      return { ...base, texto: texto(d.texto, 1000), variavel };
    }
    case 'condicao': {
      const tipoCond = ['horario', 'cadastrado', 'negocio', 'variavel'].includes(d.tipo) ? d.tipo : 'variavel';
      const dias = (Array.isArray(d.dias) ? d.dias : [1, 2, 3, 4, 5]).map(Number).filter((n: number) => n >= 0 && n <= 6);
      const hora = (h: unknown, padrao: string) => (/^\d{2}:\d{2}$/.test(String(h)) ? String(h) : padrao);
      if (tipoCond === 'variavel' && !VARIAVEL.test(String(d.variavel ?? ''))) throw erro('informe a variável a comparar.');
      return {
        ...base,
        tipo: tipoCond,
        dias,
        das: hora(d.das, '08:00'),
        ate: hora(d.ate, '18:00'),
        variavel: texto(d.variavel, 40),
        operador: OPERADORES.includes(d.operador) ? d.operador : 'igual',
        valor: texto(d.valor, 500),
      };
    }
    case 'case': {
      if (!VARIAVEL.test(String(d.variavel ?? ''))) throw erro('informe a variável a comparar.');
      const casos = (Array.isArray(d.casos) ? d.casos : []).map((c: any) => ({
        id: String(c?.id ?? ''),
        operador: OPERADORES.includes(c?.operador) ? c.operador : 'igual',
        valor: texto(c?.valor, 500),
        rotulo: texto(c?.rotulo, 60),
      }));
      if (!casos.length || casos.length > 20) throw erro('informe de 1 a 20 casos.');
      listaIds(casos, 'caso');
      return { ...base, variavel: texto(d.variavel, 40), casos };
    }
    case 'esperar': {
      const minutos = Number(d.minutos);
      if (!Number.isInteger(minutos) || minutos < 1 || minutos > 43_200) throw erro('os minutos devem ser de 1 a 43.200.');
      return { ...base, minutos, interromper: Boolean(d.interromper) };
    }
    case 'api': {
      const metodo = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(d.metodo) ? d.metodo : 'GET';
      const url = texto(d.url, 2000).trim();
      if (!/^https:\/\//i.test(url)) throw erro('a URL precisa começar com https://.');
      const antes: any[] = anterior?.nos.find((n) => n.id === id && n.tipo === 'api')?.dados.cabecalhos ?? [];
      const cabecalhos = (Array.isArray(d.cabecalhos) ? d.cabecalhos : [])
        .map((h: any) => {
          const nome = texto(h?.nome, 100).trim();
          if (!nome) return null;
          if (!/^[A-Za-z0-9-]+$/.test(nome)) throw erro(`cabeçalho com nome inválido ("${nome}").`);
          if (!h?.secreto) return { nome, valor: texto(h?.valor, 2000), secreto: false };
          // Secreto: gravado cifrado; em branco mantém o que já estava gravado
          const valor = String(h?.valor ?? '');
          const valor_cifrado = valor ? cifrar(valor.slice(0, 2000)) : antes.find((a) => a.nome === nome && a.secreto)?.valor_cifrado;
          if (!valor_cifrado) throw erro(`informe o valor do cabeçalho secreto "${nome}".`);
          return { nome, valor: '', secreto: true, valor_cifrado };
        })
        .filter(Boolean);
      const extrair = (Array.isArray(d.extrair) ? d.extrair : [])
        .map((e: any) => ({ caminho: texto(e?.caminho, 200).trim(), variavel: String(e?.variavel ?? '').trim() }))
        .filter((e: any) => e.caminho || e.variavel);
      for (const e of extrair) if (!e.caminho || !VARIAVEL.test(e.variavel)) throw erro('cada campo da resposta precisa do caminho e da variável.');
      return { ...base, metodo, url, cabecalhos, corpo: texto(d.corpo, 20_000), extrair };
    }
    case 'lead':
      return { ...base, nome: texto(d.nome, 200), empresa: texto(d.empresa, 200), email: texto(d.email, 200), interesse: texto(d.interesse, 300) };
    case 'departamento': {
      const departamento_id = Number(d.departamento_id);
      if (!Number.isInteger(departamento_id) || departamento_id < 1) throw erro('escolha o departamento.');
      return { ...base, departamento_id, texto: texto(d.texto, 1000) };
    }
    default:
      return base;
  }
}

/** Banco → tela: sem os segredos */
export function jornadaPublica(cfg: Jornada | null): Jornada {
  const j = cfg ?? VAZIA;
  return {
    ...j,
    nos: j.nos.map((n) =>
      n.tipo === 'api'
        ? { ...n, dados: { ...n.dados, cabecalhos: (n.dados.cabecalhos ?? []).map(({ valor_cifrado, ...h }: any) => ({ ...h, definido: Boolean(valor_cifrado) })) } }
        : n,
    ),
  };
}

const lerJornada = async (empresaId: string | number): Promise<Jornada | null> => lerConfig(String(empresaId), 'whatsapp', 'jornada');

/** A jornada que atende este número (ligada, e no modo teste só para os números de teste) */
export async function jornadaDoNumero(empresaId: number, telefone: string): Promise<{ jornada: Jornada; numeroDeTeste: boolean } | null> {
  const j = await lerJornada(empresaId);
  if (!j?.ativo) return null;
  const chave = chaveTelefone(telefone, true);
  const numeroDeTeste = Boolean(chave) && j.numeros_teste.some((n) => chaveTelefone(n, n.length >= 12) === chave || chaveTelefone(`55${n}`, true) === chave);
  if (j.modo === 'teste' && !numeroDeTeste) return null;
  return { jornada: j, numeroDeTeste };
}

// ------------------------------------------------------------
// Variáveis, comparações e condições
// ------------------------------------------------------------

/** {{variavel}} → valor; esc trata o valor (JSON no corpo, encodeURIComponent na URL) */
export function preencher(modelo: string, vars: Record<string, unknown>, esc: (v: string) => string = (v) => v): string {
  return String(modelo ?? '').replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, nome) => esc(String(vars[nome] ?? '')));
}
const emJson = (v: string) => JSON.stringify(v).slice(1, -1);

export const OPERADORES = ['igual', 'diferente', 'contem', 'comeca', 'maior', 'menor', 'vazio', 'preenchido', 'regex'];
const normal = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
const numero = (t: unknown) => Number(String(t ?? '').replace(/\./g, '').replace(',', '.'));

/** Compara o valor da variável com o do caso (texto sem acento e sem diferença de maiúsculas) */
export function comparar(operador: string, valor: unknown, alvo: string): boolean {
  const a = normal(valor);
  const b = normal(alvo);
  switch (operador) {
    case 'igual':
      return a === b;
    case 'diferente':
      return a !== b;
    case 'contem':
      return a.includes(b);
    case 'comeca':
      return a.startsWith(b);
    case 'maior':
      return numero(valor) > numero(alvo);
    case 'menor':
      return numero(valor) < numero(alvo);
    case 'vazio':
      return !a;
    case 'preenchido':
      return Boolean(a);
    case 'regex':
      // ponytail: regex escrita pelo administrador roda sem limite de tempo; limitar o tamanho se virar problema
      try {
        return new RegExp(alvo, 'i').test(String(valor ?? ''));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/** Dia da semana (0 = domingo) e hora "HH:MM" em Brasília */
export function agoraBrasilia(d = new Date()): { dia: number; hora: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hora: `${p.hour}:${p.minute}` };
}

export function dentroDoHorario(dados: { dias: number[]; das: string; ate: string }, agora = agoraBrasilia()): boolean {
  return dados.dias.includes(agora.dia) && agora.hora >= dados.das && agora.hora < dados.ate;
}

/** Caminho "cliente.contatos.0.nome" dentro da resposta JSON */
export function pegar(obj: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

// ------------------------------------------------------------
// Chamadas para fora (API, imagem por link): só https e nunca para a rede interna
// ------------------------------------------------------------

export function ipInterno(ip: string): boolean {
  if (ip.startsWith('::ffff:')) return ipInterno(ip.slice(7));
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** ponytail: confere o DNS antes do fetch; um DNS que muda entre a consulta e a conexão passa (rebinding) */
async function conferirDestino(url: string) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('Só endereços https.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(ipInterno)) throw new Error(`Endereço não permitido: ${u.hostname}.`);
}

async function buscarFora(url: string, init: RequestInit = {}): Promise<globalThis.Response> {
  await conferirDestino(url);
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
}

// ------------------------------------------------------------
// Execução
// ------------------------------------------------------------

interface Estado {
  conversaId: number;
  no: string | null;
  vars: Record<string, any>;
  /** Nó Esperar: manter a espera gravada, limpar, ou esperar N minutos a partir de agora (relógio do banco) */
  retomar: 'manter' | 'limpar' | number;
  /** A espera gravada já venceu */
  vencido: boolean;
}

async function lerEstado(empresaId: number, telefone: string): Promise<Estado> {
  await pool.query('INSERT IGNORE INTO whatsapp_conversas (empresa_id, telefone) VALUES (?, ?)', [empresaId, telefone]);
  const [r] = await pool.query<any[]>(
    'SELECT id, no_atual, variaveis, retomar_em IS NOT NULL AND retomar_em <= NOW() AS vencido FROM whatsapp_conversas WHERE empresa_id = ? AND telefone = ?',
    [empresaId, telefone],
  );
  let vars: Record<string, any> = {};
  try {
    vars = typeof r[0].variaveis === 'string' ? JSON.parse(r[0].variaveis) : (r[0].variaveis ?? {});
  } catch {
    vars = {};
  }
  return { conversaId: r[0].id, no: r[0].no_atual, vars, retomar: 'manter', vencido: Boolean(Number(r[0].vencido)) };
}

async function gravarEstado(empresaId: number, telefone: string, e: Estado) {
  const retomar = e.retomar === 'manter' ? 'retomar_em' : e.retomar === 'limpar' ? 'NULL' : 'NOW() + INTERVAL ? MINUTE';
  await pool.query(`UPDATE whatsapp_conversas SET no_atual = ?, variaveis = ?, retomar_em = ${retomar} WHERE empresa_id = ? AND telefone = ?`, [
    e.no,
    JSON.stringify(e.vars),
    ...(typeof e.retomar === 'number' ? [e.retomar] : []),
    empresaId,
    telefone,
  ]);
}

async function contextoDaConversa(empresaId: number, telefone: string): Promise<Contexto> {
  const [d] = await pool.query<any[]>('SELECT MAX(pessoa_id) AS pessoa_id, MAX(contato_id) AS contato_id FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ?', [
    empresaId,
    telefone,
  ]);
  const dono = d[0]?.pessoa_id ? { pessoa_id: d[0].pessoa_id, contato_id: d[0].contato_id } : await donoDoTelefone(empresaId, telefone);
  const [dep] = await pool.query<any[]>(
    'SELECT d.id, d.nome FROM whatsapp_conversas c JOIN departamentos d ON d.id = c.departamento_id WHERE c.empresa_id = ? AND c.telefone = ?',
    [empresaId, telefone],
  );
  return { empresaId, telefone, dono, departamento: dep[0] ? { id: dep[0].id, nome: dep[0].nome } : null, jornada: { transferencia: null } };
}

/** Variáveis prontas: as coletadas, mais nome (cadastro ou perfil do WhatsApp) e telefone */
async function variaveisDe(ctx: Contexto, vars: Record<string, any>): Promise<Record<string, unknown>> {
  const [p] = ctx.dono.pessoa_id ? await pool.query<any[]>('SELECT nome FROM pessoas WHERE id = ?', [ctx.dono.pessoa_id]) : [[]];
  const [perfil] = await pool.query<any[]>(
    'SELECT nome_contato FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ? AND nome_contato IS NOT NULL ORDER BY id DESC LIMIT 1',
    [ctx.empresaId, ctx.telefone],
  );
  const publicas = Object.fromEntries(Object.entries(vars).filter(([k]) => !k.startsWith('_')));
  return { nome: p[0]?.nome ?? perfil[0]?.nome_contato ?? '', telefone: telefoneCadastro(ctx.telefone), numero: ctx.telefone, departamento: ctx.departamento?.nome ?? '', ...publicas };
}

class Execucao {
  /** Mensagens já mandadas nesta execução: entre uma e outra, "digitando..." e uma pausa curta */
  private enviadas = 0;

  constructor(
    private ctx: Contexto,
    private jornada: Jornada,
    private bot: ConfigChatbot | null,
    private estado: Estado,
  ) {}

  no = (id: string | null) => this.jornada.nos.find((n) => n.id === id) ?? null;
  destino = (de: No, saida: string) => this.no(this.jornada.ligacoes.find((l) => l.de === de.id && l.saida === saida)?.para ?? null);

  private async vars() {
    return variaveisDe(this.ctx, this.estado.vars);
  }

  async enviar(textoMsg: string, midia?: ArquivoEnvio) {
    const t = textoMsg.trim();
    if (!t && !midia) return;
    if (this.enviadas) {
      await mostrarDigitando(this.ctx.empresaId, this.ctx.telefone, 1000 + Math.random() * 2000);
    }
    this.enviadas++;
    const seq = (Number(this.estado.vars._seq) || 0) + 1;
    this.estado.vars._seq = seq;
    const origem = `bot:j${this.estado.conversaId}:${seq}`;
    const id = await reservarEnvio(this.ctx.empresaId, origem, this.ctx.dono, this.ctx.telefone, t);
    if (id) await enviarReservada(this.ctx.empresaId, id, origem, this.ctx.telefone, t.slice(0, 4000), midia);
  }

  private async menu(no: No, prefixo = '') {
    const opcoes = (no.dados.opcoes ?? []).map((o: any, i: number) => `${i + 1} - ${o.rotulo}`).join('\n');
    await this.enviar(`${prefixo}${preencher(no.dados.texto ?? '', await this.vars())}\n${opcoes}`.trim());
  }

  private opcoesMenu(no: No): (OpcaoMenu & { id: string })[] {
    return (no.dados.opcoes ?? []).map((o: any, i: number) => ({ numero: i + 1, departamento_id: i + 1, nome: o.rotulo, bot: false, id: o.id }));
  }

  /** O cliente respondeu no nó em que a conversa parou: devolve o próximo nó (null = continua parada ali) */
  async responder(no: No, entrada: string): Promise<No | null | 'fim'> {
    switch (no.tipo) {
      case 'menu': {
        const opcoes = this.opcoesMenu(no);
        let escolha = entrada ? escolhaDoTexto(entrada, opcoes) : null;
        if (!escolha && entrada && this.bot?.chave_cifrada) escolha = await escolhaPelaIa(this.bot, entrada, opcoes).catch(() => null);
        if (escolha) return this.destino(no, (escolha as any).id) ?? 'fim';
        const invalida = this.destino(no, 'invalida');
        if (invalida) return invalida;
        await this.menu(no, `${no.dados.invalida || 'Desculpe, não entendi. Responda com o número de uma das opções:'}\n`);
        return null;
      }
      case 'pergunta':
        this.estado.vars[no.dados.variavel] = entrada;
        return this.destino(no, 'proximo') ?? 'fim';
      case 'ia':
        return this.ia(no);
      case 'esperar':
        if (!no.dados.interromper) return null;
        this.estado.retomar = 'limpar';
        return this.destino(no, 'proximo') ?? 'fim';
      default:
        return this.no(this.jornada.nos.find((n) => n.tipo === 'inicio')!.id);
    }
  }

  /** IA responde com o histórico; se ela passar para humano, segue a saída "humano" */
  private async ia(no: No): Promise<No | null | 'fim'> {
    if (!this.bot?.chave_cifrada || !this.bot.texto_base) {
      console.error(`Jornada: nó IA sem a chave do Gemini ou o texto-base (${ONDE} / Chatbot).`);
      return this.destino(no, 'humano') ?? 'fim';
    }
    this.ctx.jornada = { transferencia: null };
    void mostrarDigitando(this.ctx.empresaId, this.ctx.telefone, 3000);
    const resposta = await gerarRespostaIa(this.ctx, this.bot);
    await this.enviar(resposta);
    if (this.ctx.jornada.transferencia === null) return null;
    this.estado.vars.motivo = this.ctx.jornada.transferencia;
    const humano = this.destino(no, 'humano');
    if (humano) return humano;
    await mudarAtendimento(this.ctx.empresaId, this.ctx.telefone, 'humano');
    return 'fim';
  }

  /** Executa a partir do nó até um que espere o cliente, uma pausa ou o fim */
  async percorrer(inicio: No | null | 'fim') {
    let no: No | null | 'fim' = inicio;
    for (let passo = 0; passo < MAX_PASSOS; passo++) {
      if (no === null) return; // continua parado onde está
      if (no === 'fim') {
        this.estado.no = FIM;
        return;
      }
      this.estado.no = no.id;
      const d = no.dados;
      const seguir = (saida = 'proximo') => this.destino(no as No, saida) ?? 'fim';
      switch (no.tipo) {
        case 'inicio':
          no = seguir();
          break;
        case 'mensagem':
          await this.enviar(preencher(d.texto, await this.vars()));
          no = seguir();
          break;
        case 'imagem':
          await this.enviarImagem(no);
          no = seguir();
          break;
        case 'menu':
          await this.menu(no);
          return;
        case 'pergunta':
          await this.enviar(preencher(d.texto, await this.vars()));
          return;
        case 'condicao':
          no = seguir((await this.condicao(no)) ? 'sim' : 'nao');
          break;
        case 'case': {
          const v = await this.vars();
          const caso = (d.casos ?? []).find((c: any) => comparar(c.operador, v[d.variavel], preencher(c.valor, v)));
          no = seguir(caso ? caso.id : 'nenhum');
          break;
        }
        case 'esperar':
          this.estado.retomar = d.minutos;
          return;
        case 'api':
          no = seguir((await this.api(no)) ? 'sucesso' : 'erro');
          break;
        case 'ia':
          no = await this.ia(no);
          break;
        case 'lead': {
          const v = await this.vars();
          const campo = (modelo: string, padrao: string) => preencher(modelo || padrao, v).trim();
          const r: any = await registrarLead(this.ctx, {
            nome: campo(d.nome, '{{nome}}') || 'Cliente do WhatsApp',
            empresa: campo(d.empresa, '{{empresa}}'),
            email: campo(d.email, '{{email}}'),
            interesse: campo(d.interesse, '{{interesse}}') || 'Contato pelo WhatsApp',
          });
          if (!r?.ok) console.error(`Jornada: registrar lead (${this.ctx.telefone}): ${r?.erro}`);
          no = seguir();
          break;
        }
        case 'departamento': {
          const [dep] = await pool.query<any[]>('SELECT id, nome FROM departamentos WHERE id = ? AND empresa_id = ?', [d.departamento_id, this.ctx.empresaId]);
          await this.enviar(preencher(d.texto ?? '', await this.vars()));
          await mudarAtendimento(this.ctx.empresaId, this.ctx.telefone, 'humano');
          if (dep[0]) {
            this.ctx.departamento = { id: dep[0].id, nome: dep[0].nome };
            await pool.query('UPDATE whatsapp_conversas SET departamento_id = ? WHERE empresa_id = ? AND telefone = ?', [dep[0].id, this.ctx.empresaId, this.ctx.telefone]);
            await avisarDepartamento(this.ctx, this.ctx.departamento, String(this.estado.vars.motivo || 'Jornada de atendimento.'));
          }
          no = 'fim';
          break;
        }
        case 'fim':
          await this.enviar(preencher(d.texto ?? '', await this.vars()));
          no = 'fim';
          break;
      }
    }
    console.error(`Jornada: ${MAX_PASSOS} passos sem parar (${this.ctx.telefone}); a jornada tem um laço sem nó de espera.`);
    this.estado.no = FIM;
  }

  private async condicao(no: No): Promise<boolean> {
    const d = no.dados;
    if (d.tipo === 'horario') return dentroDoHorario(d as any);
    if (d.tipo === 'cadastrado') return Boolean(this.ctx.dono.pessoa_id);
    if (d.tipo === 'negocio') {
      if (!this.ctx.dono.pessoa_id) return false;
      const [r] = await pool.query<any[]>("SELECT 1 FROM negocios WHERE empresa_id = ? AND pessoa_id = ? AND status = 'aberto' LIMIT 1", [this.ctx.empresaId, this.ctx.dono.pessoa_id]);
      return r.length > 0;
    }
    const v = await this.vars();
    return comparar(d.operador, v[d.variavel], preencher(d.valor, v));
  }

  private async enviarImagem(no: No) {
    const d = no.dados;
    const legenda = preencher(d.legenda ?? '', await this.vars()) || null;
    try {
      let arquivo: ArquivoEnvio;
      if (d.arquivo_id) {
        const [a] = await pool.query<any[]>('SELECT nome, mimetype, dados FROM jornada_arquivos WHERE id = ? AND empresa_id = ?', [d.arquivo_id, this.ctx.empresaId]);
        if (!a[0]) throw new Error('imagem não encontrada.');
        arquivo = { tipo: 'imagem', base64: Buffer.from(a[0].dados).toString('base64'), mimetype: a[0].mimetype, nome: a[0].nome, legenda };
      } else {
        const r = await buscarFora(d.url);
        const mimetype = (r.headers.get('content-type') || '').split(';')[0];
        if (!r.ok || !mimetype.startsWith('image/')) throw new Error(`o link não devolveu uma imagem (HTTP ${r.status}).`);
        const dados = Buffer.from(await r.arrayBuffer());
        if (dados.length > MAX_ARQUIVO) throw new Error('imagem do link maior que 3 MB.');
        arquivo = { tipo: 'imagem', base64: dados.toString('base64'), mimetype, nome: d.url.split('/').pop() || 'imagem', legenda };
      }
      await this.enviar(legenda ?? '', arquivo);
    } catch (err: any) {
      console.error(`Jornada: nó ${rotulo(no)}: ${err.message}`);
    }
  }

  /** Chamada de API: sucesso = HTTP 2xx; os campos pedidos da resposta viram variáveis */
  private async api(no: No): Promise<boolean> {
    const d = no.dados;
    const v = await this.vars();
    try {
      const headers: Record<string, string> = {};
      for (const h of d.cabecalhos ?? []) headers[h.nome] = h.secreto ? decifrar(h.valor_cifrado, ONDE) : preencher(h.valor, v);
      const corpo = d.metodo !== 'GET' && d.corpo?.trim() ? preencher(d.corpo, v, emJson) : undefined;
      if (corpo && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
      const r = await buscarFora(preencher(d.url, v, encodeURIComponent), { method: d.metodo, headers, body: corpo });
      const bruto = (await r.text()).slice(0, 200_000);
      let json: unknown = null;
      try {
        json = JSON.parse(bruto);
      } catch {
        json = null;
      }
      this.estado.vars.api_status = String(r.status);
      for (const e of d.extrair ?? []) {
        const valor = pegar(json, e.caminho);
        this.estado.vars[e.variavel] = valor == null ? '' : typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
      }
      return r.ok;
    } catch (err: any) {
      this.estado.vars.api_status = '0';
      console.error(`Jornada: nó ${rotulo(no)}: ${err.message}`);
      return false;
    }
  }
}

/** Trava por conversa (duas mensagens seguidas, ou cron e mensagem ao mesmo tempo) */
async function comTrava(empresaId: number, telefone: string, fn: () => Promise<void>) {
  const conn = await pool.getConnection();
  const nome = `crmweb_jornada:${empresaId}:${telefone}`;
  try {
    const [t] = await conn.query<any[]>('SELECT GET_LOCK(?, 15) AS ok', [nome]);
    if (!t[0]?.ok) return;
    try {
      await fn();
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [nome]);
    }
  } finally {
    conn.release();
  }
}

/** Mensagem recebida numa conversa atendida pela jornada (chamada pelo responderComBot) */
export async function executarJornada(nova: MensagemNova, jornada: Jornada, bot: ConfigChatbot | null): Promise<void> {
  await comTrava(nova.empresaId, nova.telefone, async () => {
    const estado = await lerEstado(nova.empresaId, nova.telefone);
    // Aviso repetido da Evolution, ou mensagem mais antiga que a última tratada
    if (Number(estado.vars._msg) >= nova.id) return;
    estado.vars._msg = nova.id;
    const [m] = await pool.query<any[]>('SELECT tipo, texto FROM whatsapp_mensagens WHERE id = ?', [nova.id]);
    const entrada = m[0]?.tipo === 'texto' ? String(m[0].texto ?? '').trim() : '';
    estado.vars.mensagem = entrada;

    const ctx = await contextoDaConversa(nova.empresaId, nova.telefone);
    const exec = new Execucao(ctx, jornada, bot, estado);
    const inicio = jornada.nos.find((n) => n.tipo === 'inicio')!;
    const atual = exec.no(estado.no);
    try {
      if (!atual || estado.no === FIM) {
        // Depois do Fim, só recomeça se a conversa estava parada (senão um "obrigado" traria o menu de novo)
        if (estado.no === FIM) {
          const [ant] = await pool.query<any[]>(
            'SELECT MAX(data_hora) < NOW() - INTERVAL ? MINUTE AS parada FROM whatsapp_mensagens WHERE empresa_id = ? AND telefone = ? AND id < ?',
            [minutosDevolver(bot), nova.empresaId, nova.telefone, nova.id],
          );
          if (!Number(ant[0]?.parada)) return;
        }
        estado.retomar = 'limpar';
        await exec.percorrer(inicio);
      } else {
        await exec.percorrer(await exec.responder(atual, entrada));
      }
    } catch (err: any) {
      console.error(`Jornada: empresa ${nova.empresaId}, ${nova.telefone}: ${err.message}`);
    } finally {
      await gravarEstado(nova.empresaId, nova.telefone, estado);
    }
  });
}

/**
 * Um ciclo do cron: conversas paradas num nó Esperar cujo tempo acabou continuam a jornada.
 * Devolve quantas continuaram.
 */
export async function retomarJornadas(prazoMs = Infinity): Promise<number> {
  const fim = Date.now() + prazoMs;
  const [rows] = await pool.query<any[]>(
    "SELECT empresa_id, telefone FROM whatsapp_conversas WHERE retomar_em IS NOT NULL AND retomar_em <= NOW() AND atendimento = 'bot' ORDER BY retomar_em LIMIT 50",
  );
  let n = 0;
  for (const r of rows) {
    if (Date.now() > fim) break;
    await comTrava(r.empresa_id, r.telefone, async () => {
      const estado = await lerEstado(r.empresa_id, r.telefone);
      if (!estado.vencido) return;
      estado.retomar = 'limpar';
      try {
        const j = await jornadaDoNumero(r.empresa_id, r.telefone);
        if (!j) return; // jornada desligada (ou número saiu do teste): só limpa a espera
        const ctx = await contextoDaConversa(r.empresa_id, r.telefone);
        const exec = new Execucao(ctx, j.jornada, await lerChatbot(r.empresa_id), estado);
        const esperando = exec.no(estado.no);
        await exec.percorrer(esperando?.tipo === 'esperar' ? (exec.destino(esperando, 'proximo') ?? 'fim') : null);
        n++;
      } catch (err: any) {
        console.error(`Jornada: retomar ${r.telefone}: ${err.message}`);
      } finally {
        await gravarEstado(r.empresa_id, r.telefone, estado);
      }
    });
  }
  return n;
}

/** Fora da Vercel: um ciclo a cada minuto (na Vercel é o cron de /api/cron/whatsapp) */
export function iniciarJornadas() {
  let rodando = false;
  setInterval(async () => {
    if (rodando) return;
    rodando = true;
    try {
      const n = await retomarJornadas();
      if (n) console.log(`Jornada: ${n} conversa(s) retomada(s) depois do Esperar.`);
    } catch (err: any) {
      console.error('Jornada: falha no ciclo:', err.message);
    } finally {
      rodando = false;
    }
  }, 60_000);
}

// ------------------------------------------------------------
// Imagens dos nós "Enviar imagem"
// ------------------------------------------------------------

export function createJornadaRouter(): Router {
  const router = Router();

  router.post('/jornada/arquivos', async (req: Request, res: Response) => {
    try {
      somenteAdmin(res);
      const mimetype = String(req.body?.mimetype ?? '');
      if (!/^image\/(png|jpe?g|gif|webp)$/.test(mimetype)) return res.status(400).json({ error: 'Envie uma imagem PNG, JPG, GIF ou WEBP.' });
      const dados = Buffer.from(String(req.body?.base64 ?? ''), 'base64');
      if (!dados.length) return res.status(400).json({ error: 'Imagem vazia.' });
      if (dados.length > MAX_ARQUIVO) return res.status(400).json({ error: 'Imagem maior que 3 MB.' });
      const nome = String(req.body?.nome || 'imagem').replace(/[\\/]/g, '_').slice(0, 150);
      const [r] = await pool.query<any>('INSERT INTO jornada_arquivos (empresa_id, nome, mimetype, dados) VALUES (?, ?, ?, ?)', [res.locals.empresaId, nome, mimetype, dados]);
      res.json({ id: r.insertId, nome });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  router.get('/jornada/arquivos/:id', async (req: Request, res: Response) => {
    try {
      const [r] = await pool.query<any[]>('SELECT mimetype, dados FROM jornada_arquivos WHERE id = ? AND empresa_id = ?', [Number(req.params.id) || 0, res.locals.empresaId]);
      if (!r[0]) return res.status(404).json({ error: 'Imagem não encontrada.' });
      res.set('Cache-Control', 'private, max-age=86400').type(r[0].mimetype).send(Buffer.from(r[0].dados));
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return router;
}
