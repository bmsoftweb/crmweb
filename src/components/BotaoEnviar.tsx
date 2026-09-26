import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Mail, MessageCircle, Send } from 'lucide-react';
import { RegistroCrud } from '../types';
import { enviarDocumento, fetchDocumento, TipoDocumento } from '../services/api';
import { formatDateBR, formatMoeda } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';
import { ConfirmDialog } from './ConfirmDialog';
import { BotaoAcao, useEmMenu } from './MenuAcoes';

type Canal = 'email' | 'whatsapp';

interface Props {
  tipo: TipoDocumento;
  registro: RegistroCrud;
  onRecarregar: () => void;
  onToast: (msg: string) => void;
}

/** Texto inicial da mensagem, montado com os dados do documento */
function mensagemPadrao(d: RegistroCrud, tipo: TipoDocumento): string {
  const validade = d.data_validade ? `, válida até ${formatDateBR(d.data_validade)}` : '';
  const doc =
    tipo === 'propostas'
      ? `a proposta nº ${d.numero_proposta} — ${d.titulo}, no valor de ${formatMoeda(d.valor_total)}${validade}`
      : `o pedido nº ${d.numero_pedido}${d.negocio_titulo ? ` — ${d.negocio_titulo}` : ''}, no valor de ${formatMoeda(d.valor_total)}`;
  return [
    `Olá${d.pessoa_nome ? ` ${d.pessoa_nome}` : ''},`,
    '',
    `Segue ${doc}.`,
    '',
    'Fico à disposição para qualquer dúvida.',
    d.empresa_nome || '',
  ]
    .join('\n')
    .trim();
}

/**
 * Ação "Enviar" das listas de propostas e pedidos: menu com E-mail e WhatsApp; a opção abre
 * um diálogo com destinatário e mensagem já preenchidos, e o servidor manda o PDF.
 */
export const BotaoEnviar: React.FC<Props> = ({ tipo, registro, onRecarregar, onToast }) => {
  const ehProposta = tipo === 'propostas';
  const nome = ehProposta ? `a proposta #${registro.numero_proposta} v${registro.versao}` : `o pedido #${registro.numero_pedido}`;
  const botaoRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [envio, setEnvio] = useState<{ canal: Canal; destino: string; mensagem: string } | null>(null);
  const emMenu = useEmMenu();

  // Menu fecha ao clicar fora, rolar a lista ou apertar Esc
  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('mousedown', fechar);
    document.addEventListener('scroll', fechar, true);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('scroll', fechar, true);
      document.removeEventListener('keydown', tecla);
    };
  }, [menu]);

  const escolher = async (canal: Canal) => {
    setMenu(null);
    setCarregando(true);
    try {
      const d = await fetchDocumento(tipo, registro.id as number);
      if (ehProposta && d.status === 'fechada') return onToast('Proposta fechada: outra versão desta proposta foi aceita.');
      if (!ehProposta && d.status === 'cancelado') return onToast('Pedido cancelado não pode ser enviado.');
      setEnvio({ canal, destino: String((canal === 'email' ? d.pessoa_email : d.pessoa_whatsapp || d.pessoa_telefone) || ''), mensagem: mensagemPadrao(d, tipo) });
    } catch (err: any) {
      onToast(err.message || `Não foi possível carregar ${ehProposta ? 'a proposta' : 'o pedido'}.`);
    } finally {
      setCarregando(false);
    }
  };

  const item = 'w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer';

  const anexo = ehProposta ? 'PDF da proposta e o link para o cliente aprovar e assinar' : 'PDF do pedido anexo';
  return (
    <>
      {emMenu ? (
        <>
          <BotaoAcao icone={Mail} titulo="Enviar por e-mail" descricao={`Mensagem com o ${anexo}`} carregando={carregando} onClick={() => escolher('email')} />
          <BotaoAcao icone={MessageCircle} titulo="Enviar por WhatsApp" descricao={`Mensagem com o ${anexo}`} tom="verde" carregando={carregando} onClick={() => escolher('whatsapp')} />
        </>
      ) : (
      <button
        ref={botaoRef}
        onClick={(e) => {
          e.stopPropagation();
          const r = botaoRef.current!.getBoundingClientRect();
          setMenu(menu ? null : { top: r.bottom + 4, right: window.innerWidth - r.right });
        }}
        disabled={carregando}
        title="Enviar"
        className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer disabled:cursor-wait"
      >
        {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
      </button>
      )}

      {/* No body: dentro da célula fixa da coluna Ações ficaria cortado; o span segura os cliques */}
      {menu &&
        createPortal(
          <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <div
              role="menu"
              onMouseDown={(e) => e.stopPropagation()}
              style={{ top: menu.top, right: menu.right }}
              className="fixed z-[60] min-w-36 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl"
            >
              <button role="menuitem" onClick={() => escolher('email')} className={item}>
                <Mail className="w-3.5 h-3.5 text-stone-400" /> E-mail
              </button>
              <button role="menuitem" onClick={() => escolher('whatsapp')} className={item}>
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
              </button>
            </div>
          </span>,
          document.body,
        )}

      {envio &&
        createPortal(
          <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <ConfirmDialog
              titulo={`Enviar ${nome} por ${envio.canal === 'email' ? 'e-mail' : 'WhatsApp'}`}
              mensagem={`O PDF ${ehProposta ? 'da proposta' : 'do pedido'} vai anexo.${ehProposta ? ' No fim da mensagem vai o link para o cliente aprovar e assinar a proposta. Proposta em rascunho passa a Enviada.' : ''} O envio fica no histórico do negócio (com a tarefa "Retorno Envio", se estiver ligada em Configurações › Vendas).`}
              confirmar="Enviar"
              tom="normal"
              onConfirmar={async () => {
                const r = await enviarDocumento(tipo, registro.id as number, envio);
                setEnvio(null);
                onToast(
                  `${ehProposta ? 'Proposta enviada' : 'Pedido enviado'} por ${envio.canal === 'email' ? 'e-mail' : 'WhatsApp'}${r.statusAlterado ? ' e marcada como Enviada' : ''}` +
                    `${r.tarefaRetorno ? '; tarefa "Retorno Envio" criada' : ''}.`,
                );
                onRecarregar();
              }}
              onCancelar={() => setEnvio(null)}
            >
              <div className="flex flex-col gap-3">
                <div className={FIELD_CLASS}>
                  <label htmlFor="envio-destino" className={LABEL_CLASS}>
                    {envio.canal === 'email' ? 'E-mail do destinatário' : 'Telefone (WhatsApp) com DDD'}
                  </label>
                  <input
                    id="envio-destino"
                    type={envio.canal === 'email' ? 'email' : 'tel'}
                    value={envio.destino}
                    onChange={(e) => setEnvio({ ...envio, destino: e.target.value })}
                    required
                    autoFocus
                    className={`${INPUT_CLASS} w-full`}
                  />
                </div>
                <div className={FIELD_CLASS}>
                  <label htmlFor="envio-mensagem" className={LABEL_CLASS}>
                    Mensagem
                  </label>
                  <textarea
                    id="envio-mensagem"
                    value={envio.mensagem}
                    onChange={(e) => setEnvio({ ...envio, mensagem: e.target.value })}
                    rows={7}
                    className={`${INPUT_CLASS} w-full resize-y`}
                  />
                </div>
              </div>
            </ConfirmDialog>
          </span>,
          document.body,
        )}
    </>
  );
};
