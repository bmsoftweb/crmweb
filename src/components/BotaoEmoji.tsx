import React, { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { Picker } from 'emoji-picker-element';
import ptBR from 'emoji-picker-element/i18n/pt_BR';
// Dados dos emojis em português (nomes e palavras da busca), servidos pelo próprio app em vez do CDN.
// Tem de ser o emoji-picker-element-data: o emojibase-data novo (v7+) mudou o formato e o seletor recusa
import dadosPt from 'emoji-picker-element-data/pt/cldr/data.json?url';

/**
 * Botão de emoji ao lado do campo da mensagem: abre para cima o seletor completo (emoji-picker-element),
 * com categorias, busca em português, tom de pele e usados recentemente. Clicar insere o emoji no ponto
 * do cursor (onEscolher) e mantém o seletor aberto para escolher outros. Fecha ao clicar fora ou Esc.
 */
export const BotaoEmoji: React.FC<{ onEscolher: (emoji: string) => void; disabled?: boolean; className?: string }> = ({ onEscolher, disabled, className }) => {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const escolher = useRef(onEscolher);
  escolher.current = onEscolher;

  useEffect(() => {
    if (!aberto || !area.current) return;
    const picker = new Picker({ locale: 'pt', dataSource: dadosPt, i18n: ptBR });
    picker.classList.add(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    picker.addEventListener('emoji-click', (e) => e.detail.unicode && escolher.current(e.detail.unicode));
    area.current.appendChild(picker);
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      picker.remove();
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative shrink-0 flex">
      <button type="button" onClick={() => setAberto(!aberto)} disabled={disabled} title="Emojis" aria-label="Emojis" className={className}>
        <Smile className="w-4 h-4" />
      </button>
      {aberto && <div ref={area} className="absolute bottom-full left-0 mb-2 z-50 max-w-[90vw] rounded-xl shadow-2xl overflow-hidden" />}
    </div>
  );
};
