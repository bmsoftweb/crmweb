import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ScrollText } from 'lucide-react';
import { BotaoAcao } from './MenuAcoes';
import { RegistroCrud } from '../types';
import { gerarContratoDaProposta } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  registro: RegistroCrud;
  /** Vai para a tela de Contratos depois de gerar */
  onAbrirContratos: () => void;
  onToast: (msg: string) => void;
}

/** Ação "Gerar contrato" da lista de propostas (só nas aceitas) */
export const BotaoGerarContrato: React.FC<Props> = ({ registro, onAbrirContratos, onToast }) => {
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);

  /** Um erro aqui (ex.: a proposta já gerou contrato) aparece dentro do diálogo */
  const gerar = async () => {
    setGerando(true);
    try {
      const r = await gerarContratoDaProposta(registro.id as number);
      setConfirmando(false);
      onToast(`Contrato nº ${r.numero} gerado em rascunho. Confira vigência, periodicidade e vencimento.`);
      onAbrirContratos();
    } finally {
      setGerando(false);
    }
  };

  return (
    <>
      <BotaoAcao
        icone={ScrollText}
        titulo="Gerar contrato"
        descricao="Cria o contrato desta proposta aceita, em rascunho, com os itens dela"
        tom="verde"
        carregando={gerando}
        onClick={() => setConfirmando(true)}
      />

      {confirmando &&
        // No body: dentro da célula fixa da coluna Ações o diálogo ficaria sob o cabeçalho da grade.
        // O span segura os cliques, que no React sobem até a linha mesmo pelo portal.
        createPortal(
          <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <ConfirmDialog
              titulo={`Gerar contrato da proposta #${registro.numero_proposta} v${registro.versao}?`}
              mensagem="Cria o contrato em rascunho com o cliente, o negócio e os itens da proposta, começando hoje, com vigência de 12 meses, cobrança mensal e renovação automática. Ajuste o que for preciso antes de mandar assinar."
              confirmar="Gerar contrato"
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
