import {
  Phone,
  Users,
  CheckSquare,
  Flag,
  Mail,
  Utensils,
  StickyNote,
  MessageCircle,
  MapPin,
  Handshake,
  Laptop,
  type LucideIcon,
} from 'lucide-react';
import type { FieldDef, RegistroCrud } from '../types';
import { hojeIso } from './formatters';

export const TIPOS_ATIVIDADE: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'ligacao', label: 'Ligação', icon: Phone },
  { value: 'reuniao', label: 'Reunião Interna', icon: Users },
  { value: 'reuniao_externa', label: 'Reunião Externa', icon: Handshake },
  { value: 'reuniao_virtual', label: 'Reunião Virtual', icon: Laptop },
  { value: 'visita', label: 'Visita', icon: MapPin },
  { value: 'tarefa', label: 'Tarefa', icon: CheckSquare },
  { value: 'prazo', label: 'Prazo', icon: Flag },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'almoco', label: 'Almoço', icon: Utensils },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

/** Ícones que abrem o assunto das reuniões (server/schema.ts, ICONE_DO_TIPO): continuam como primeiro caractere */
const ICONES_REUNIAO = ['🚗', '🏠', '💻'];

/**
 * Texto exibido de um campo com `prefixo` (ex.: "Luis : Implementar..."), sem mexer no que está gravado.
 * O ícone da reunião fica na frente do nome: "🚗 Luis : Visita".
 */
export function comPrefixo(field: FieldDef, row: RegistroCrud, valor: unknown): unknown {
  const p = field.prefixo;
  const nome = p ? String(row[p.campo] ?? '').trim() : '';
  if (!p || !nome || nome === p.exceto || valor == null || valor === '') return valor;
  const texto = String(valor);
  const icone = ICONES_REUNIAO.find((i) => texto.startsWith(i));
  return icone ? `${icone} ${nome} : ${texto.slice(icone.length).trimStart()}` : `${nome} : ${texto}`;
}

/**
 * Exclui a atividade: administrador, ou o dono (quem criou; sem autor gravado, o executor).
 * Mesma regra de conferirDonoAtividade (server/crud.ts), que é quem de fato barra.
 */
export function podeExcluirAtividade(row: RegistroCrud, usuario: { id: string; tipo: string } | null | undefined): boolean {
  if (!usuario) return false;
  if (usuario.tipo === 'admin') return true;
  const dono = row.criado_por ?? row.executor_id;
  return dono != null && String(dono) === String(usuario.id);
}

/** Para quem vai o lembrete automático da atividade (o mesmo de server/schema.ts) */
export const LEMBRETE_PARA = [
  { value: 'cliente', label: 'Cliente' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'ambos', label: 'Cliente e vendedor' },
  { value: 'todos', label: 'Todos os envolvidos' },
  { value: 'nenhum', label: 'Ninguém' },
];

export const TIPOS_INTERACAO: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'nota', label: 'Nota', icon: StickyNote },
  { value: 'ligacao', label: 'Ligação', icon: Phone },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'reuniao', label: 'Reunião', icon: Users },
];

export const iconeAtividade = (tipo: string | null | undefined): LucideIcon =>
  TIPOS_ATIVIDADE.find((t) => t.value === tipo)?.icon || CheckSquare;
export const iconeInteracao = (tipo: string | null | undefined): LucideIcon =>
  TIPOS_INTERACAO.find((t) => t.value === tipo)?.icon || StickyNote;
export const rotuloAtividade = (tipo: string | null | undefined) =>
  TIPOS_ATIVIDADE.find((t) => t.value === tipo)?.label || String(tipo || '');

export type Semaforo = 'verde' | 'vermelho' | 'amarelo';

/**
 * Indicador de follow-up do negócio, a partir da próxima atividade pendente:
 * vermelho = atrasada, verde = em dia, amarelo = nenhuma atividade agendada.
 * Sem hora, a atividade vale o dia todo (só atrasa no dia seguinte).
 */
export function semaforoFollowup(data: string | null | undefined, hora: string | null | undefined, agora = new Date()): Semaforo {
  if (!data) return 'amarelo';
  const dia = String(data).slice(0, 10);
  const hoje = hojeIso();
  if (dia < hoje) return 'vermelho';
  if (dia > hoje || !hora) return 'verde';
  const hhmm = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  return String(hora).slice(0, 5) < hhmm ? 'vermelho' : 'verde';
}

export const COR_SEMAFORO: Record<Semaforo, { ponto: string; texto: string; rotulo: string }> = {
  verde: { ponto: 'bg-emerald-500', texto: 'text-emerald-700 dark:text-emerald-400', rotulo: 'Em dia' },
  vermelho: { ponto: 'bg-rose-500', texto: 'text-rose-700 dark:text-rose-400', rotulo: 'Atrasado' },
  amarelo: { ponto: 'bg-amber-400', texto: 'text-amber-700 dark:text-amber-400', rotulo: 'Sem atividade agendada' },
};

/** "Hoje", "Amanhã", "Ontem" ou dd/mm, com a hora quando houver */
export function quando(data: string | null | undefined, hora?: string | null): string {
  if (!data) return '';
  const dia = String(data).slice(0, 10);
  const hoje = new Date();
  const desloca = (n: number) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [a, m, d] = dia.split('-');
  const nome = dia === desloca(0) ? 'Hoje' : dia === desloca(1) ? 'Amanhã' : dia === desloca(-1) ? 'Ontem' : `${d}/${m}${a !== String(hoje.getFullYear()) ? `/${a}` : ''}`;
  return hora ? `${nome} ${String(hora).slice(0, 5)}` : nome;
}
