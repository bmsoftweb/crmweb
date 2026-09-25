import React, { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { RegistroCrud } from '../types';
import { linkAceiteProposta } from '../services/api';

interface Props {
  registro: RegistroCrud;
  onToast: (msg: string) => void;
}

/** Ação "Copiar link" da lista de propostas: o link em que o cliente aprova e assina (o mesmo do envio) */
export const BotaoLinkAceite: React.FC<Props> = ({ registro, onToast }) => {
  const [gerando, setGerando] = useState(false);
  if (['aceita', 'recusada', 'fechada', 'expirada'].includes(String(registro.status))) return null;

  const copiar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setGerando(true);
    try {
      const { link } = await linkAceiteProposta(registro.id as number);
      try {
        await navigator.clipboard.writeText(link);
        onToast('Link de aprovação copiado. Cole na mensagem para o cliente.');
      } catch {
        window.prompt('Copie o link de aprovação:', link);
      }
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setGerando(false);
    }
  };

  return (
    <button
      onClick={copiar}
      disabled={gerando}
      title="Copiar link: o cliente abre, confere a proposta e aprova com assinatura digital"
      className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer disabled:cursor-wait"
    >
      {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
    </button>
  );
};
