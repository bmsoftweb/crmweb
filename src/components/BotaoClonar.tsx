import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';
import { BotaoAcao } from './MenuAcoes';
import { RegistroCrud } from '../types';
import { clonarDocumento, getRecord } from '../services/api';
import { refProposta } from '../utils/formatters';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  tipo: 'propostas' | 'pedidos' | 'produtos';
  registro: RegistroCrud;
  /** Abre a cópia numa aba de edição */
  onAbrir: (row: RegistroCrud) => void;
  onRecarregar: () => void;
  onToast: (msg: string) => void;
}

/** Textos de cada lista */
const TEXTOS = {
  propostas: {
    nome: 'a proposta',
    descricao: 'Cria uma proposta nova com o mesmo conteúdo, com número próprio',
    mensagem: 'Será criada uma proposta nova, em rascunho e com número próprio, com o mesmo conteúdo. A original não muda.',
  },
  pedidos: {
    nome: 'o pedido',
    descricao: 'Cria um pedido novo com o mesmo conteúdo, com número próprio',
    mensagem: 'Será criado um pedido novo, em rascunho e com número próprio, com o mesmo conteúdo. O original não muda.',
  },
  produtos: {
    nome: 'o produto',
    descricao: 'Cria um produto novo com os mesmos dados',
    mensagem: 'Será criado um produto novo com o nome seguido de "(cópia)", o mesmo preço, unidade e descrição. SKU e fotos ficam em branco. O original não muda.',
  },
};

/**
 * Ação "Clonar" das listas de propostas, pedidos e produtos: confirma, gera um registro novo
 * (documento: número próprio, rascunho) e abre a cópia.
 */
export const BotaoClonar: React.FC<Props> = ({ tipo, registro, onAbrir, onRecarregar, onToast }) => {
  const [clonando, setClonando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const ehProposta = tipo === 'propostas';
  const t = TEXTOS[tipo];
  const numero =
    tipo === 'produtos'
      ? `"${registro.nome}"`
      : ehProposta
        ? refProposta(registro)
        : `#${registro.numero_pedido ?? registro.id}`;

  /** Um erro aqui aparece dentro do diálogo de confirmação */
  const clonar = async () => {
    setClonando(true);
    try {
      const r = await clonarDocumento(tipo, registro.id as number);
      onToast(
        tipo === 'produtos'
          ? `Produto clonado: ${registro.nome} (cópia).`
          : ehProposta ? 'Proposta clonada.' : `Pedido clonado como #${r.numero_pedido}.`,
      );
      setConfirmando(false);
      onRecarregar();
      // Produto abre no formulário genérico, que usa a linha como está: busca a cópia completa
      onAbrir(tipo === 'produtos' ? await getRecord('produtos', r.id) : r);
    } finally {
      setClonando(false);
    }
  };

  return (
    <>
      <BotaoAcao
        icone={Copy}
        titulo="Clonar"
        descricao={t.descricao}
        carregando={clonando}
        onClick={() => setConfirmando(true)}
      />

      {confirmando &&
        // No body: dentro da célula fixa da coluna Ações o diálogo ficaria sob o cabeçalho da grade.
        // O span segura os cliques, que no React sobem até a linha mesmo pelo portal.
        createPortal(
          <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <ConfirmDialog
              titulo={`Clonar ${t.nome} ${numero}?`}
              mensagem={t.mensagem}
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
