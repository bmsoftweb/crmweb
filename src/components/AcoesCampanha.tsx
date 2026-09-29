import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, Send, X } from 'lucide-react';
import { RegistroCrud } from '../types';
import { enviarDisparoAgora, gerarDisparos, previaCampanha, PreviaCampanha } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { BotaoAcao } from './MenuAcoes';

/** Diálogos vão para o body: dentro da célula fixa da coluna Ações ficariam sob o cabeçalho; o span segura os cliques */
const noBody = (conteudo: React.ReactNode) =>
  createPortal(
    <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {conteudo}
    </span>,
    document.body,
  );

interface Props {
  registro: RegistroCrud;
  onRecarregar: () => void;
  onToast: (msg: string) => void;
}

/** Ações da linha da campanha: pré-visualizar a mensagem com o público e gerar os disparos */
export const AcaoCampanha: React.FC<Props> = ({ registro, onRecarregar, onToast }) => {
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [previa, setPrevia] = useState<PreviaCampanha | null>(null);
  const id = registro.id as number;

  const verPrevia = async () => {
    setOcupado(true);
    try {
      setPrevia(await previaCampanha(id));
    } catch (err: any) {
      onToast(err.message || 'Não foi possível montar a pré-visualização.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <BotaoAcao icone={Eye} titulo="Pré-visualizar" descricao="Mostra o tamanho do público e a mensagem pronta para as primeiras pessoas" carregando={ocupado} onClick={verPrevia} />
      <BotaoAcao icone={Send} titulo="Gerar disparos" descricao="Cria uma mensagem por pessoa do público e começa o envio" onClick={() => setConfirmando(true)} />
      {confirmando &&
        noBody(
          <ConfirmDialog
            titulo={`Gerar os disparos de "${registro.nome}"?`}
            mensagem="Cria uma mensagem por pessoa do público, já personalizada, com o celular ou e-mail de destino. Quem não tem o contato do canal fica de fora; quem já recebeu não recebe de novo; os pendentes são refeitos com o texto atual. A campanha passa a Em execução e o envio começa (ou na data de Enviar a partir de)."
            confirmar="Gerar disparos"
            tom="normal"
            onConfirmar={async () => {
              const r = await gerarDisparos(id);
              setConfirmando(false);
              const partes = [`${r.gerados} disparo(s) gerado(s) de ${r.publico} pessoa(s) do público`];
              if (r.sem_contato) partes.push(`${r.sem_contato} sem o contato do canal`);
              if (r.ja_enviados) partes.push(`${r.ja_enviados} já tinham recebido`);
              onToast(`${partes.join('; ')}.${r.situacao === 'pausada' ? ' A campanha está pausada: o envio só começa quando voltar a Em execução.' : ''}`);
              onRecarregar();
            }}
            onCancelar={() => setConfirmando(false)}
          />,
        )}
      {previa &&
        noBody(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={() => setPrevia(null)} aria-hidden="true" />
            <div role="dialog" aria-modal="true" className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10 p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Pré-visualização</h3>
                <button onClick={() => setPrevia(null)} title="Fechar" className="p-1 rounded text-stone-400 hover:text-stone-700 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                Público: <strong>{previa.publico}</strong> pessoa(s). Exemplos com os dados das primeiras:
              </p>
              {!previa.exemplos.length ? (
                <p className="text-xs text-stone-500">Ninguém atende aos critérios da campanha.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {previa.exemplos.map((p, i) => (
                    <div key={i} className="rounded-lg border border-stone-200 dark:border-stone-800 p-3">
                      <div className="text-[11px] font-semibold text-stone-400 mb-1">
                        Para: {p.nome} {p.destino ? `(${p.destino})` : '— sem o contato do canal: fica de fora'}
                      </div>
                      {previa.imagem && <img src={previa.imagem} alt="Imagem da campanha" className="max-h-48 rounded-lg mb-2" />}
                      {p.assunto && <div className="text-xs font-bold text-stone-800 dark:text-stone-100 mb-1">{p.assunto}</div>}
                      <div className="text-xs text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{p.corpo}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>,
        )}
    </>
  );
};

/** Detalhe Disparos: envia na hora um disparo pendente ou que falhou (os já enviados ficam com o botão apagado) */
export const BotaoEnviarDisparo: React.FC<{ registro: RegistroCrud; onEnviado: () => void; onToast: (msg: string) => void }> = ({
  registro,
  onEnviado,
  onToast,
}) => {
  const [enviando, setEnviando] = useState(false);
  const pode = registro.situacao === 'pendente' || registro.situacao === 'falhou';
  return (
    <button
      type="button"
      disabled={!pode || enviando}
      onClick={async (e) => {
        e.stopPropagation();
        setEnviando(true);
        try {
          await enviarDisparoAgora(registro.id as number);
          onToast(`Mensagem enviada para ${registro.nome} (${registro.destino}).`);
        } catch (err: any) {
          onToast(err.message || 'Não foi possível enviar.');
        } finally {
          setEnviando(false);
          onEnviado();
        }
      }}
      title={pode ? `Enviar agora para ${registro.destino}${registro.situacao === 'falhou' ? ' (tenta de novo)' : ''}` : `Já ${registro.situacao}: não é enviado de novo`}
      className="p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-stone-400"
    >
      {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
    </button>
  );
};
