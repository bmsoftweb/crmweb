import {
  LayoutDashboard,
  KanbanSquare,
  Handshake,
  CalendarCheck,
  History,
  FileSignature,
  ShoppingCart,
  Building2,
  Users,
  Package,
  Filter,
  Columns3,
  KeyRound,
  ListOrdered,
  Tags,
  Network,
  Megaphone,
  ScrollText,
  Target,
  MessageSquareText,
  MessageCircle,
  Send,
  Star,
  Settings,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { ResourceDef, ResourceGroup, Usuario } from '../types';
import { GROUP_LABELS } from './formatters';

/** Mapa dos ícones declarados no registro de metadados do servidor */
const ICONS: Record<string, LucideIcon> = {
  Handshake,
  CalendarCheck,
  History,
  FileSignature,
  ShoppingCart,
  Building2,
  Users,
  Package,
  Filter,
  Columns3,
  KeyRound,
  ListOrdered,
  Tags,
  Network,
  Megaphone,
  ScrollText,
  Target,
  MessageSquareText,
  Send,
  Star,
};

const GROUP_ORDER: ResourceGroup[] = ['vendas', 'marketing', 'cadastros', 'acesso'];

export interface ItemMenu {
  id: string;
  label: string;
  descricao: string;
  icone: LucideIcon;
  /** Só administrador: aparece no menu dele, mas não entra nas permissões */
  somenteAdmin?: boolean;
}

/** Opções só de administrador (mesma lista de SO_ADMIN em server/permissoes.ts) */
const SO_ADMIN = ['usuarios', 'configuracoes'];

/**
 * Opções do menu, agrupadas como na barra lateral. É a mesma lista das permissões do usuário
 * (Usuários › Permissões): o id de cada opção é o que fica gravado em usuarios.permissoes.
 * Usuários fica de fora: é só para administradores, que acessam tudo.
 */
export function gruposDoMenu(resources: ResourceDef[]): { titulo: string; itens: ItemMenu[] }[] {
  const grupos = [
    {
      titulo: 'Visão Geral',
      itens: [
        { id: 'dashboard', label: 'Painel de Vendas', descricao: 'Indicadores do funil', icone: LayoutDashboard },
        { id: 'kanban', label: 'Funil de Vendas', descricao: 'Kanban dos negócios', icone: KanbanSquare },
        { id: 'conversas', label: 'Conversas', descricao: 'Mensagens do WhatsApp', icone: MessageCircle },
      ],
    },
    ...GROUP_ORDER.map((group) => ({
      titulo: GROUP_LABELS[group] || group,
      itens: resources
        .filter((r) => r.group === group && !r.oculto && r.name !== 'usuarios')
        .map((r) => ({ id: r.name, label: r.label, descricao: r.description, icone: ICONS[r.icon] || Database })),
    })),
    { titulo: 'Sistema', itens: [{ id: 'configuracoes', label: 'Configurações', descricao: 'Preferências da empresa', icone: Settings, somenteAdmin: true }] },
  ];
  return grupos.filter((g) => g.itens.length);
}

/** O usuário acessa a opção: administrador acessa tudo; sem permissões gravadas, também */
export function podeAcessar(usuario: Usuario | null, id: string): boolean {
  if (!usuario) return false;
  if (SO_ADMIN.includes(id)) return usuario.tipo === 'admin';
  if (usuario.tipo === 'admin' || !Array.isArray(usuario.permissoes)) return true;
  return usuario.permissoes.includes(id);
}
