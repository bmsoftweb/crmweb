import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { BotaoAcao } from './MenuAcoes';
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
    <BotaoAcao
      icone={Printer}
      titulo="Imprimir / PDF"
      descricao={`Abre ${nome} numa aba, pronta para imprimir ou salvar em PDF`}
      carregando={abrindo}
      onClick={async () => {
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
    />
  );
};
