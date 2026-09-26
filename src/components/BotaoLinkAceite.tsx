import React, { useState } from 'react';
import { Link2 } from 'lucide-react';
import { BotaoAcao } from './MenuAcoes';
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

  const copiar = async () => {
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
    <BotaoAcao
      icone={Link2}
      titulo="Copiar link de aprovação"
      descricao="Link em que o cliente confere a proposta e aprova com assinatura digital"
      carregando={gerando}
      onClick={copiar}
    />
  );
};
