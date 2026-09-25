import React, { useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { RegistroCrud } from '../types';
import { fetchDocumento } from '../services/api';
import { htmlDocumento } from '../utils/imprimirDocumento';

interface Props {
  tipo: 'propostas' | 'pedidos';
  registro: RegistroCrud;
  onToast: (msg: string) => void;
}

/** Ação "Imprimir" da lista: abre o documento gravado numa aba, pronto para imprimir ou salvar em PDF */
export const BotaoImprimir: React.FC<Props> = ({ tipo, registro, onToast }) => {
  const [abrindo, setAbrindo] = useState(false);
  const nome = tipo === 'propostas' ? 'a proposta' : 'o pedido';
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        // A aba abre ainda no clique: aberta depois de um await, o bloqueador de pop-up a barraria
        const janela = window.open('', '_blank');
        if (!janela) return onToast('O navegador bloqueou a nova aba. Libere pop-ups para este site e tente de novo.');
        janela.document.write(`<p style="font-family:sans-serif">Preparando ${nome}…</p>`);
        setAbrindo(true);
        try {
          const d = await fetchDocumento(tipo, registro.id as number);
          janela.document.open();
          janela.document.write(htmlDocumento(d, tipo));
          janela.document.close();
        } catch (err: any) {
          janela.close();
          onToast(err.message || `Não foi possível abrir ${nome} para impressão.`);
        } finally {
          setAbrindo(false);
        }
      }}
      disabled={abrindo}
      title="Imprimir / PDF"
      className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer disabled:cursor-wait"
    >
      {abrindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
    </button>
  );
};
