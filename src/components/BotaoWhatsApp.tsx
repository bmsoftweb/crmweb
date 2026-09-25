import React from 'react';
import { MessageCircle } from 'lucide-react';

/**
 * Ícone do WhatsApp nas linhas das listas (Pessoas, Contatos): abre a tela Conversas com o número.
 * Sem número cadastrado fica apagado, dizendo o motivo.
 */
export const BotaoWhatsApp: React.FC<{ temNumero: boolean; onAbrir: () => void }> = ({ temNumero, onAbrir }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onAbrir();
    }}
    disabled={!temNumero}
    title={temNumero ? 'Conversar pelo WhatsApp' : 'Sem WhatsApp nem telefone cadastrado'}
    className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer disabled:text-stone-300 dark:disabled:text-stone-600 disabled:hover:bg-transparent disabled:cursor-default"
  >
    <MessageCircle className="w-3.5 h-3.5" />
  </button>
);
