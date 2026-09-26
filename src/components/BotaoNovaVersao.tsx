import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranchPlus } from 'lucide-react';
import { BotaoAcao } from './MenuAcoes';
import { RegistroCrud } from '../types';
import { fetchDocumento, novaVersaoProposta } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  registro: RegistroCrud;
  /** Abre a versão nova numa aba de edição */
  onAbrir: (row: RegistroCrud) => void;
  onRecarregar: () => void;
  onToast: (msg: string) => void;
}

/**
 * Ação "Nova versão" da lista de propostas: confirma e copia a proposta como a próxima
 * versão do mesmo número, em rascunho (mesma regra do botão do editor).
 */
export const BotaoNovaVersao: React.FC<Props> = ({ registro, onAbrir, onRecarregar, onToast }) => {
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const numero = `#${registro.numero_proposta} v${registro.versao}`;

  /** Um erro aqui (ex.: outra versão já aceita) aparece dentro do diálogo */
  const gerar = async () => {
    setGerando(true);
    try {
      const { id } = await novaVersaoProposta(registro.id as number);
      const nova = await fetchDocumento('propostas', id);
      onToast(`Versão v${nova.versao} da proposta #${nova.numero_proposta} criada.`);
      setConfirmando(false);
      onRecarregar();
      onAbrir(nova);
    } finally {
      setGerando(false);
    }
  };

  return (
    <>
      <BotaoAcao
        icone={GitBranchPlus}
        titulo="Nova versão"
        descricao="Copia esta proposta como a próxima versão do mesmo número, para renegociar"
        carregando={gerando}
        onClick={() => setConfirmando(true)}
      />

      {confirmando &&
        // No body: dentro da célula fixa da coluna Ações o diálogo ficaria sob o cabeçalho da grade.
        // O span segura os cliques, que no React sobem até a linha mesmo pelo portal.
        createPortal(
          <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <ConfirmDialog
              titulo={`Gerar nova versão da proposta ${numero}?`}
              mensagem={
                <>
                  A proposta é copiada como a próxima versão, em rascunho, para renegociação.
                  {registro.status === 'enviada' && ' Esta versão enviada passa a constar como recusada.'}
                </>
              }
              confirmar="Gerar versão"
              tom="normal"
              onConfirmar={gerar}
              onCancelar={() => setConfirmando(false)}
            />
          </span>,
          document.body,
        )}
    </>
  );
};
