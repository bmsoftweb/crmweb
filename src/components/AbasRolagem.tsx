import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Faixa de abas que passa da largura da tela: sem barra de rolagem e, quando as abas não cabem,
 * uma seta em cada lado (apagada no lado que já chegou ao fim).
 */
export const AbasRolagem: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => {
  const faixa = useRef<HTMLDivElement>(null);
  const [lados, setLados] = useState({ rola: false, esquerda: false, direita: false });

  const medir = useCallback(() => {
    const el = faixa.current;
    if (!el) return;
    const rola = el.scrollWidth > el.clientWidth + 1;
    const esquerda = el.scrollLeft > 0;
    const direita = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setLados((l) => (l.rola === rola && l.esquerda === esquerda && l.direita === direita ? l : { rola, esquerda, direita }));
  }, []);

  useEffect(() => {
    medir();
    const el = faixa.current;
    if (!el) return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir]);

  const rolar = (sentido: -1 | 1) => faixa.current?.scrollBy({ left: sentido * faixa.current.clientWidth * 0.7, behavior: 'smooth' });
  const seta = (sentido: -1 | 1) => (
    <button
      type="button"
      onClick={() => rolar(sentido)}
      disabled={sentido < 0 ? !lados.esquerda : !lados.direita}
      title={sentido < 0 ? 'Ver as abas anteriores' : 'Ver as próximas abas'}
      aria-label={sentido < 0 ? 'Ver as abas anteriores' : 'Ver as próximas abas'}
      className="shrink-0 px-1.5 flex items-center text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:text-stone-500"
    >
      {sentido < 0 ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
    </button>
  );

  return (
    <div className={`flex items-stretch ${className}`}>
      {lados.rola && seta(-1)}
      <div ref={faixa} onScroll={medir} className="flex flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {lados.rola && seta(1)}
    </div>
  );
};
