import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { OpcaoRef } from '../types';
import { fetchOptions } from '../services/api';

interface Props {
  proprietarioId: number | string | null | undefined;
  /** Grava o novo proprietário; a lista fecha quando termina */
  onEscolher: (usuarioId: string) => Promise<void>;
  /** O que aparece no lugar do botão (etiqueta do card, nome na ficha) */
  children: React.ReactNode;
  title?: string;
  className?: string;
}

const LARGURA = 208;

/**
 * Troca rápida do proprietário do negócio: clique abre a lista de usuários ativos.
 * A lista fica em posição fixa, para não ser cortada pela coluna do Kanban.
 */
export const TrocarProprietario: React.FC<Props> = ({ proprietarioId, onEscolher, children, title, className }) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [usuarios, setUsuarios] = useState<OpcaoRef[] | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const atual = String(proprietarioId ?? '');

  const abrir = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8)) });
    fetchOptions('usuarios', 'nome')
      .then(setUsuarios)
      .catch(() => setUsuarios([]));
  };

  const escolher = async (id: string) => {
    if (id === atual) return setPos(null);
    setGravando(id);
    try {
      await onEscolher(id);
      setPos(null);
    } finally {
      setGravando(null);
    }
  };

  // Inativos só aparecem se forem o proprietário atual
  const lista = (usuarios || []).filter((u) => !u.label.endsWith('(inativo)') || u.value === atual);

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
        title={title}
        className={className}
      >
        {children}
      </button>
      {pos && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={(e) => {
              e.stopPropagation();
              setPos(null);
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: pos.top, left: pos.left, width: LARGURA }}
            className="fixed z-[61] max-h-72 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg py-1"
          >
            <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Proprietário</div>
            {usuarios === null ? (
              <div className="px-3 py-2 flex items-center gap-2 text-xs text-stone-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
              </div>
            ) : (
              lista.map((u) => (
                <button
                  key={u.value}
                  type="button"
                  disabled={gravando !== null}
                  onClick={() => escolher(u.value)}
                  className={`w-full px-3 py-2 text-xs text-left flex items-center justify-between gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:cursor-wait ${
                    u.value === atual ? 'text-blue-700 dark:text-blue-300 font-semibold' : 'text-stone-700 dark:text-stone-200'
                  }`}
                >
                  <span className="truncate">{u.label}</span>
                  {gravando === u.value ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    u.value === atual && <Check className="w-3.5 h-3.5 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
};
