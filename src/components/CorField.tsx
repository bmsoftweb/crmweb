import React from 'react';
import { Check } from 'lucide-react';

/** Tabela de cores dos campos tipo "cor" (#RRGGBB) */
export const CORES_TABELA = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899',
  '#F43F5E', '#78716C', '#64748B', '#1F2937',
];

/** Escolha da cor clicando na tabela; "Sem cor" limpa */
export const CorField: React.FC<{ id: string; value: string; onChange: (v: string) => void }> = ({ id, value, onChange }) => {
  const atual = value.toUpperCase();
  return (
    <div id={id} role="radiogroup" className="flex flex-wrap items-center gap-1.5 py-1">
      {CORES_TABELA.map((cor) => (
        <button
          key={cor}
          type="button"
          role="radio"
          aria-checked={atual === cor}
          title={cor}
          onClick={() => onChange(cor)}
          className={`w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ${
            atual === cor ? 'ring-2 ring-offset-1 ring-stone-700 dark:ring-stone-200 dark:ring-offset-stone-900' : ''
          }`}
          style={{ background: cor }}
        >
          {atual === cor && <Check className="w-3.5 h-3.5 text-white" />}
        </button>
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={!atual}
        onClick={() => onChange('')}
        className={`h-6 px-2 rounded-md text-[11px] font-semibold border cursor-pointer ${
          !atual ? 'border-stone-700 text-stone-800 dark:border-stone-200 dark:text-stone-100' : 'border-stone-300 text-stone-500 dark:border-stone-700'
        }`}
      >
        Sem cor
      </button>
      {atual && !CORES_TABELA.includes(atual) && (
        <span className="flex items-center gap-1 text-[11px] text-stone-500" title="Cor gravada fora da tabela">
          <span className="w-4 h-4 rounded" style={{ background: value }} /> {value}
        </span>
      )}
    </div>
  );
};
