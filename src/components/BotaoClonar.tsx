import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Loader2 } from 'lucide-react';
import { RegistroCrud } from '../types';
import { clonarDocumento } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  tipo: 'propostas' | 'pedidos';
  registro: RegistroCrud;
  /** Abre a cópia numa aba de edição */
  onAbrir: (row: RegistroCrud) => void;
  onRecarregar: () => void;
  onToast: (msg: string) => void;
}

/**
 * Ação "Clonar" das listas de propostas e pedidos: confirma, gera um documento novo
 * (número próprio, rascunho) e abre a cópia.
 */
export const BotaoClonar: React.FC<Props> = ({ tipo, registro, onAbrir, onRecarregar, onToast }) => {
  const [clonando, setClonando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const ehProposta = tipo === 'propostas';
  const numero = ehProposta
    ? `#${registro.numero_proposta ?? registro.id} v${registro.versao ?? 1}`
    : `#${registro.numero_pedido ?? registro.id}`;

  /** Um erro aqui aparece dentro do diálogo de confirmação */
  const clonar = async () => {
    setClonando(true);
    try {
      const r = await clonarDocumento(tipo, registro.id as number);
      onToast(`${ehProposta ? 'Proposta clonada' : 'Pedido clonado'} como #${r.numero_proposta ?? r.numero_pedido}.`);
      setConfirmando(false);
      onRecarregar();
      onAbrir(r);
    } finally {
      setClonando(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfirmando(true);
        }}
        disabled={clonando}
        title={`Clonar: cria ${ehProposta ? 'uma proposta nova' : 'um pedido novo'} com o mesmo conteúdo (número próprio)`}
        className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer disabled:cursor-wait"
      >
        {clonando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
      </button>

      {confirmando &&
        // No body: dentro da célula fixa da coluna Ações o diálogo ficaria sob o cabeçalho da grade.
        // O span segura os cliques, que no React sobem até a linha mesmo pelo portal.
        createPortal(
          <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <ConfirmDialog
              titulo={`Clonar ${ehProposta ? 'a proposta' : 'o pedido'} ${numero}?`}
              mensagem={
                ehProposta
                  ? 'Será criada uma proposta nova, em rascunho e com número próprio, com o mesmo conteúdo. A original não muda.'
                  : 'Será criado um pedido novo, em rascunho e com número próprio, com o mesmo conteúdo. O original não muda.'
              }
              confirmar="Clonar"
              tom="normal"
              onConfirmar={clonar}
              onCancelar={() => setConfirmando(false)}
            />
          </span>,
          document.body,
        )}
    </>
  );
};
