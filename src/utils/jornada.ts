import {
  Bot,
  Clock,
  Flag,
  GitBranch,
  GitFork,
  Globe,
  HelpCircle,
  Image,
  ListOrdered,
  type LucideIcon,
  MessageSquare,
  Network,
  Play,
  UserPlus,
} from 'lucide-react';

/** Jornada de atendimento: o mesmo formato de server/jornada.ts */
export type TipoNo = 'inicio' | 'mensagem' | 'imagem' | 'menu' | 'pergunta' | 'condicao' | 'case' | 'esperar' | 'api' | 'ia' | 'lead' | 'departamento' | 'fim';

export interface NoJornada {
  id: string;
  tipo: TipoNo;
  x: number;
  y: number;
  dados: Record<string, any>;
}
export interface LigacaoJornada {
  de: string;
  saida: string;
  para: string;
}
export interface Jornada {
  ativo: boolean;
  modo: 'teste' | 'todos';
  numeros_teste: string[];
  nos: NoJornada[];
  ligacoes: LigacaoJornada[];
}

export const TIPOS_NO: Record<TipoNo, { nome: string; icone: LucideIcon; cor: string; ajuda: string }> = {
  inicio: { nome: 'Início', icone: Play, cor: 'emerald', ajuda: 'Primeira mensagem do cliente (ou conversa que recomeçou).' },
  mensagem: { nome: 'Mensagem', icone: MessageSquare, cor: 'blue', ajuda: 'Envia um texto e segue.' },
  imagem: { nome: 'Enviar imagem', icone: Image, cor: 'blue', ajuda: 'Envia uma imagem (enviada aqui ou por link) com legenda.' },
  menu: { nome: 'Menu', icone: ListOrdered, cor: 'violet', ajuda: 'Opções numeradas; cada opção segue para um nó. Espera a resposta.' },
  pergunta: { nome: 'Pergunta', icone: HelpCircle, cor: 'violet', ajuda: 'Pergunta e guarda a resposta numa variável. Espera a resposta.' },
  condicao: { nome: 'Condição', icone: GitBranch, cor: 'amber', ajuda: 'Horário, cliente cadastrado, negócio aberto ou variável: sim ou não.' },
  case: { nome: 'Condição múltipla', icone: GitFork, cor: 'amber', ajuda: 'Compara uma variável com vários casos; o primeiro que bater decide a saída.' },
  esperar: { nome: 'Esperar', icone: Clock, cor: 'stone', ajuda: 'Pausa X minutos e continua sozinho.' },
  api: { nome: 'Chamar API', icone: Globe, cor: 'cyan', ajuda: 'Chama outro sistema (https) e guarda campos da resposta em variáveis.' },
  ia: { nome: 'IA (Gemini)', icone: Bot, cor: 'fuchsia', ajuda: 'Conversa com o texto-base do Chatbot até passar para humano.' },
  lead: { nome: 'Registrar lead', icone: UserPlus, cor: 'teal', ajuda: 'Cadastra pessoa, negócio e atividade com as variáveis coletadas.' },
  departamento: { nome: 'Departamento', icone: Network, cor: 'sky', ajuda: 'Passa para humano do departamento (atividade + aviso no WhatsApp).' },
  fim: { nome: 'Fim', icone: Flag, cor: 'rose', ajuda: 'Encerra a jornada (com uma mensagem opcional).' },
};

/** Classes por cor (escritas por extenso para o Tailwind encontrar) */
export const CORES: Record<string, { borda: string; fundo: string; texto: string }> = {
  emerald: { borda: 'border-emerald-400', fundo: 'bg-emerald-50 dark:bg-emerald-950/40', texto: 'text-emerald-700 dark:text-emerald-300' },
  blue: { borda: 'border-blue-400', fundo: 'bg-blue-50 dark:bg-blue-950/40', texto: 'text-blue-700 dark:text-blue-300' },
  violet: { borda: 'border-violet-400', fundo: 'bg-violet-50 dark:bg-violet-950/40', texto: 'text-violet-700 dark:text-violet-300' },
  amber: { borda: 'border-amber-400', fundo: 'bg-amber-50 dark:bg-amber-950/40', texto: 'text-amber-700 dark:text-amber-300' },
  stone: { borda: 'border-stone-400', fundo: 'bg-stone-100 dark:bg-stone-800', texto: 'text-stone-700 dark:text-stone-300' },
  cyan: { borda: 'border-cyan-400', fundo: 'bg-cyan-50 dark:bg-cyan-950/40', texto: 'text-cyan-700 dark:text-cyan-300' },
  fuchsia: { borda: 'border-fuchsia-400', fundo: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', texto: 'text-fuchsia-700 dark:text-fuchsia-300' },
  teal: { borda: 'border-teal-400', fundo: 'bg-teal-50 dark:bg-teal-950/40', texto: 'text-teal-700 dark:text-teal-300' },
  sky: { borda: 'border-sky-400', fundo: 'bg-sky-50 dark:bg-sky-950/40', texto: 'text-sky-700 dark:text-sky-300' },
  rose: { borda: 'border-rose-400', fundo: 'bg-rose-50 dark:bg-rose-950/40', texto: 'text-rose-700 dark:text-rose-300' },
};

export const OPERADORES = [
  { value: 'igual', label: 'é igual a' },
  { value: 'diferente', label: 'é diferente de' },
  { value: 'contem', label: 'contém' },
  { value: 'comeca', label: 'começa com' },
  { value: 'maior', label: 'maior que (número)' },
  { value: 'menor', label: 'menor que (número)' },
  { value: 'vazio', label: 'está vazio' },
  { value: 'preenchido', label: 'está preenchido' },
  { value: 'regex', label: 'combina com a regex' },
];

/** Saídas do nó, com o rótulo que aparece embaixo dele (mesma regra de server/jornada.ts) */
export function saidasDoNo(no: Pick<NoJornada, 'tipo' | 'dados'>): { id: string; rotulo: string }[] {
  const d = no.dados;
  switch (no.tipo) {
    case 'menu':
      return [...(d.opcoes ?? []).map((o: any, i: number) => ({ id: o.id, rotulo: `${i + 1} ${o.rotulo || ''}`.trim() })), { id: 'invalida', rotulo: 'não entendeu' }];
    case 'condicao':
      return [
        { id: 'sim', rotulo: 'sim' },
        { id: 'nao', rotulo: 'não' },
      ];
    case 'case':
      return [...(d.casos ?? []).map((c: any, i: number) => ({ id: c.id, rotulo: c.rotulo || `caso ${i + 1}` })), { id: 'nenhum', rotulo: 'nenhum' }];
    case 'api':
      return [
        { id: 'sucesso', rotulo: 'sucesso' },
        { id: 'erro', rotulo: 'erro' },
      ];
    case 'ia':
      return [{ id: 'humano', rotulo: 'passou p/ humano' }];
    case 'departamento':
    case 'fim':
      return [];
    default:
      return [{ id: 'proximo', rotulo: '' }];
  }
}

export const novoId = (prefixo = 'n') => `${prefixo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Dados iniciais de um nó novo */
export function dadosPadrao(tipo: TipoNo): Record<string, any> {
  switch (tipo) {
    case 'mensagem':
      return { texto: '' };
    case 'imagem':
      return { arquivo_id: null, url: '', legenda: '' };
    case 'menu':
      return { texto: 'Escolha uma opção:', opcoes: [{ id: novoId('o'), rotulo: 'Opção 1' }], invalida: '' };
    case 'pergunta':
      return { texto: 'Qual é o seu nome?', variavel: 'nome' };
    case 'condicao':
      return { tipo: 'horario', dias: [1, 2, 3, 4, 5], das: '08:00', ate: '18:00', variavel: '', operador: 'igual', valor: '' };
    case 'case':
      return { variavel: 'mensagem', casos: [{ id: novoId('c'), operador: 'contem', valor: '', rotulo: '' }] };
    case 'esperar':
      return { minutos: 5, interromper: true };
    case 'api':
      return { metodo: 'GET', url: 'https://', cabecalhos: [], corpo: '', extrair: [] };
    case 'lead':
      return { nome: '{{nome}}', empresa: '{{empresa}}', email: '{{email}}', interesse: '{{interesse}}' };
    case 'departamento':
      return { departamento_id: null, texto: 'Certo! Vou te encaminhar para a equipe. Um atendente já vai continuar a conversa por aqui.' };
    case 'fim':
      return { texto: '' };
    default:
      return {};
  }
}

/** Resumo de uma linha do que o nó faz (no quadro) */
export function resumoNo(no: NoJornada, departamentos: { value: string; label: string }[]): string {
  const d = no.dados;
  switch (no.tipo) {
    case 'mensagem':
    case 'fim':
    case 'pergunta':
    case 'menu':
      return d.texto || '';
    case 'imagem':
      return d.arquivo_nome || d.url || '';
    case 'condicao':
      return d.tipo === 'horario'
        ? `Horário ${d.das}–${d.ate}`
        : d.tipo === 'cadastrado'
          ? 'Cliente cadastrado?'
          : d.tipo === 'negocio'
            ? 'Tem negócio aberto?'
            : `{{${d.variavel}}} ${OPERADORES.find((o) => o.value === d.operador)?.label ?? ''} ${d.valor}`;
    case 'case':
      return `{{${d.variavel}}}`;
    case 'esperar':
      return `${d.minutos} min${d.interromper ? ' (ou até o cliente escrever)' : ''}`;
    case 'api':
      return `${d.metodo} ${d.url}`;
    case 'departamento':
      return departamentos.find((x) => Number(x.value) === Number(d.departamento_id))?.label ?? 'Escolha o departamento';
    case 'lead':
      return 'Pessoa + negócio + atividade';
    case 'ia':
      return 'Responde com o texto-base';
    default:
      return '';
  }
}

/** Avisos antes de salvar (não impedem): nó solto, saída sem ligação */
export function avisosJornada(j: Pick<Jornada, 'nos' | 'ligacoes'>): string[] {
  const avisos: string[] = [];
  const nome = (n: NoJornada) => n.dados.titulo || TIPOS_NO[n.tipo].nome;
  for (const n of j.nos) {
    if (n.tipo !== 'inicio' && !j.ligacoes.some((l) => l.para === n.id)) avisos.push(`"${nome(n)}" não recebe nenhuma ligação (nunca é alcançado).`);
    for (const s of saidasDoNo(n)) {
      if (['invalida', 'nenhum', 'erro', 'humano'].includes(s.id)) continue;
      if (!j.ligacoes.some((l) => l.de === n.id && l.saida === s.id)) avisos.push(`"${nome(n)}": a saída ${s.rotulo ? `"${s.rotulo}"` : ''} não está ligada (encerra a jornada).`);
    }
  }
  return avisos;
}

/** Variáveis que dá para usar nos textos: as prontas e as criadas por Pergunta e Chamar API */
export function variaveisDisponiveis(nos: NoJornada[]): string[] {
  const v = new Set(['nome', 'telefone', 'numero', 'mensagem', 'departamento', 'motivo', 'api_status']);
  for (const n of nos) {
    if (n.tipo === 'pergunta' && n.dados.variavel) v.add(n.dados.variavel);
    if (n.tipo === 'api') for (const e of n.dados.extrair ?? []) if (e.variavel) v.add(e.variavel);
  }
  return [...v];
}
