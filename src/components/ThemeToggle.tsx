import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { ThemeMode } from '../utils/theme';

/** Modo claro/escuro: só na tela de login (o tema escolhido vale depois de entrar) */
export const ThemeToggle: React.FC<{ theme: ThemeMode; onToggle: () => void; className?: string }> = ({ theme, onToggle, className = '' }) => {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      id="login-btn-theme-toggle"
      onClick={onToggle}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Ativar modo claro (Iluminação padrão)' : 'Ativar modo escuro (Descanso visual)'}
      className={`relative p-2 rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer border shadow-xs ${
        isDark ? 'bg-stone-900/90 text-amber-400 border-stone-800 hover:bg-stone-800' : 'bg-white/90 text-stone-700 border-stone-200 hover:bg-stone-50'
      } ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400 transition-transform rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 text-stone-600 transition-transform -rotate-12 hover:rotate-0" />
      )}
    </button>
  );
};
