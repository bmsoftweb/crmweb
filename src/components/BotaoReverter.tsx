import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Undo2 } from 'lucide-react';
import { BotaoAcao } from './MenuAcoes';
import { RegistroCrud } from '../types';
import { reverterProposta } from '../services/api';
import { refProposta } from '../utils/formatters';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * TEMPORÁRIO (para testes; tirar depois junto com POST /crm/propostas/:id/reverter): volta a proposta aceita ou
 * recusada para "Enviada", apagando a assinatura e o pedido em rascunho gerado por ela.
 */
export const BotaoReverter: React.FC<{ registro: RegistroCrud; onRecarregar: () => void; onToast: (msg: string) => void }> = ({
  registro,
  onRecarregar,
  onToast,
}) => {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <>
      <BotaoAcao
        icone={Undo2}
        titulo="Reverter"
        descricao="Volta a proposta para Enviada, como antes da resposta do cliente (teste)"
        onClick={() => setConfirmando(true)}
      />
      {confirmando &&
        createPortal(
          <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <ConfirmDialog
              titulo={`Reverter a proposta ${refProposta(registro)}?`}
              mensagem="A proposta volta para Enviada: a assinatura do cliente é apagada e o pedido em rascunho gerado por ela é excluído. As outras versões fechadas voltam a Recusada."
              confirmar="Reverter"
              onConfirmar={async () => {
                const r = await reverterProposta(registro.id as number);
                setConfirmando(false);
                onToast(`Proposta revertida para Enviada${r.pedidos_excluidos ? '; pedido excluído' : ''}.`);
                onRecarregar();
              }}
              onCancelar={() => setConfirmando(false)}
            />
          </span>,
          document.body,
        )}
    </>
  );
};
