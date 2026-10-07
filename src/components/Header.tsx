import React from 'react';
import { Menu, Plus, RefreshCw, Bell } from 'lucide-react';
import type { ItemMenu } from '../utils/menu';
import { ThemeMode } from '../utils/theme';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  /** Empresa logada (tenant) */
  empresaNome: string;
  title: string;
  subtitle: string;
  onOpenMobileSidebar: () => void;
  onRefresh?: () => void;
  onCreate?: () => void;
  createLabel?: string;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  /** Sino das visitas ao site: abre Visitas do Site; pisca com visita nova ainda não vista */
  onAbrirVisitas?: () => void;
  visitaNova?: boolean;
  /** Opções favoritas do menu: só o ícone, antes do sino */
  favoritos?: ItemMenu[];
  onAbrirFavorito?: (id: string) => void;
  activeTab?: string;
}

export const Header: React.FC<HeaderProps> = ({
  empresaNome,
  title,
  subtitle,
  onOpenMobileSidebar,
  onRefresh,
  onCreate,
  createLabel,
  theme = 'light',
  onToggleTheme,
  onAbrirVisitas,
  visitaNova,
  favoritos = [],
  onAbrirFavorito,
  activeTab,
}) => {
  return (
    <header className="h-[var(--altura-topo)] shrink-0 z-20 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        {/* Título da tela */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileSidebar}
            id="btn-open-sidebar-mobile"
            title="Abrir menu de navegação"
            className="lg:hidden p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-tight truncate">
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mr-2 hidden sm:inline">
                  {empresaNome} •
                </span>
                {title}
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate hidden sm:block">{subtitle}</p>
            </div>
          </div>
        </div>

        {/* Ações à direita */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {favoritos.map(({ id, label, icone: Icone }) => (
            <button
              key={id}
              id={`btn-favorito-${id}`}
              onClick={() => onAbrirFavorito?.(id)}
              title={label}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                activeTab === id
                  ? 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300'
                  : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <Icone className="w-4 h-4" />
            </button>
          ))}

          {onAbrirVisitas && (
            <button
              id="btn-visitas-site"
              onClick={onAbrirVisitas}
              title={visitaNova ? 'Alguém entrou no site: ver em Visitas do Site' : 'Visitas do Site'}
              className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
                visitaNova
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 animate-pulse'
                  : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <Bell className="w-4 h-4" />
              {visitaNova && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" />}
            </button>
          )}

          {onToggleTheme && (
            <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="header" />
          )}

          {onRefresh && (
            <button
              id="btn-atualizar"
              onClick={onRefresh}
              title="Recarregar os dados desta tela"
              className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {onCreate && (
            <button
              id="btn-novo-registro"
              onClick={onCreate}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{createLabel || 'Novo'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
