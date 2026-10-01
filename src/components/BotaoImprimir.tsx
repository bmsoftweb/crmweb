import React, { useState } from 'react';
import { ListCollapse, Printer } from 'lucide-react';
import { BotaoAcao } from './MenuAcoes';
import { RegistroCrud } from '../types';
import { fetchDocumento } from '../services/api';
import { htmlDocumento } from '../utils/imprimirDocumento';

interface Props {
  tipo: 'propostas' | 'pedidos';
  registro: RegistroCrud;
  onToast: (msg: string) => void;
}

/**
 * Ações "Imprimir" da lista: abrem o documento gravado numa aba, pronto para imprimir ou salvar em PDF.
 * Detalhada: item a item. Resumida: produtos agrupados pelo grupo (Cadastros › Grupos de Produtos).
 */
export const BotaoImprimir: React.FC<Props> = ({ tipo, registro, onToast }) => {
  const [abrindo, setAbrindo] = useState<'detalhada' | 'resumida' | null>(null);
  const nome = tipo === 'propostas' ? 'a proposta' : 'o pedido';

  const imprimir = async (modo: 'detalhada' | 'resumida') => {
    // A aba abre ainda no clique: aberta depois de um await, o bloqueador de pop-up a barraria
    const janela = window.open('', '_blank');
    if (!janela) return onToast('O navegador bloqueou a nova aba. Libere pop-ups para este site e tente de novo.');
    janela.document.write(`<p style="font-family:sans-serif">Preparando ${nome}…</p>`);
    setAbrindo(modo);
    try {
      const d = await fetchDocumento(tipo, registro.id as number);
      janela.document.open();
      janela.document.write(htmlDocumento(d, tipo, modo === 'resumida'));
      janela.document.close();
    } catch (err: any) {
      janela.close();
      onToast(err.message || `Não foi possível abrir ${nome} para impressão.`);
    } finally {
      setAbrindo(null);
    }
  };

  return (
    <>
      <BotaoAcao
        icone={Printer}
        titulo="Imprimir detalhada"
        descricao={`Abre ${nome} item a item numa aba, pronta para imprimir ou salvar em PDF`}
        carregando={abrindo === 'detalhada'}
        onClick={() => imprimir('detalhada')}
      />
      <BotaoAcao
        icone={ListCollapse}
        titulo="Imprimir resumida"
        descricao="Os produtos do mesmo grupo saem numa linha só, com o valor somado"
        carregando={abrindo === 'resumida'}
        onClick={() => imprimir('resumida')}
      />
    </>
  );
};
