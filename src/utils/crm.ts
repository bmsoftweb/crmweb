import {
  Phone,
  Users,
  CheckSquare,
  Flag,
  Mail,
  Utensils,
  StickyNote,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { hojeIso } from './formatters';

export const TIPOS_ATIVIDADE: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'ligacao', label: 'Ligação', icon: Phone },
  { value: 'reuniao', label: 'Reunião', icon: Users },
  { value: 'tarefa', label: 'Tarefa', icon: CheckSquare },
  { value: 'prazo', label: 'Prazo', icon: Flag },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'almoco', label: 'Almoço', icon: Utensils },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
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

/** Sugestões do campo de condição de pagamento (aceita também texto livre) */
export const CONDICOES_PAGAMENTO = [
  'À vista',
  'À vista com desconto',
  'Boleto 28 dias',
  '30 dias',
  '30/60 dias',
  '30/60/90 dias',
  'Entrada + 30/60 dias',
  'Cartão de crédito à vista',
  'Cartão de crédito em 3x',
  'Cartão de crédito em 6x',
  'PIX',
];

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
