import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranchPlus, Loader2 } from 'lucide-react';
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfirmando(true);
        }}
        disabled={gerando}
        title="Nova versão: copia esta proposta como a próxima versão do mesmo número"
        className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer disabled:cursor-wait"
      >
        {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranchPlus className="w-3.5 h-3.5" />}
      </button>

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
