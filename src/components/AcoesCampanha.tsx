import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { RegistroCrud } from '../types';
import { calcularSegmento, gerarDisparos, previaMensagem } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

const BOTAO =
  'p-1 rounded text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer disabled:cursor-wait';

/** Diálogos vão para o body: dentro da célula fixa da coluna Ações ficariam sob o cabeçalho; o span segura os cliques */
const noBody = (conteudo: React.ReactNode) =>
  createPortal(
    <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {conteudo}
    </span>,
    document.body,
  );

interface Props {
  tipo: 'campanhas' | 'campanha_segmentos' | 'campanha_mensagens';
  registro: RegistroCrud;
  onRecarregar: () => void;
  onToast: (msg: string) => void;
}

/** Ação da linha nas listas de campanhas, segmentos e mensagens */
export const AcaoCampanha: React.FC<Props> = ({ tipo, registro, onRecarregar, onToast }) => {
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [previa, setPrevia] = useState<{ nome: string; assunto: string; corpo: string }[] | null>(null);
  const id = registro.id as number;

  const executar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try {
      await fn();
    } catch (err: any) {
      onToast(err.message || 'Não foi possível concluir a ação.');
    } finally {
      setOcupado(false);
    }
  };

  const clique = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  if (tipo === 'campanhas') {
    return (
      <>
        <button onClick={clique(() => setConfirmando(true))} disabled={ocupado} title="Gerar disparos" className={BOTAO}>
          <Send className="w-3.5 h-3.5" />
        </button>
        {confirmando &&
          noBody(
            <ConfirmDialog
              titulo={`Gerar os disparos de "${registro.nome}"?`}
              mensagem="Os segmentos são recalculados e cada mensagem aprovada ganha um disparo pendente por pessoa do público (quem já tem disparo daquela mensagem não recebe outro). Pessoas sem o contato do canal ficam de fora."
              confirmar="Gerar disparos"
              tom="normal"
              onConfirmar={async () => {
                const r = await gerarDisparos(id);
                setConfirmando(false);
                onToast(r.gerados ? `${r.gerados} disparo(s) gerado(s).` : 'Nenhum disparo novo: o público já foi atendido.');
                onRecarregar();
              }}
              onCancelar={() => setConfirmando(false)}
            />,
          )}
      </>
    );
  }

  if (tipo === 'campanha_segmentos') {
    return (
      <button
        onClick={clique(() =>
          executar(async () => {
            const r = await calcularSegmento(id);
            onToast(`Segmento recalculado: ${r.total} pessoa(s).`);
            onRecarregar();
          }),
        )}
        disabled={ocupado}
        title="Recalcular o público"
        className={BOTAO}
      >
        {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={clique(() => executar(async () => setPrevia(await previaMensagem(id))))}
        disabled={ocupado}
        title="Pré-visualizar com os dados do público"
        className={BOTAO}
      >
        {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      {previa &&
        noBody(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={() => setPrevia(null)} aria-hidden="true" />
            <div role="dialog" aria-modal="true" className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Pré-visualização</h3>
                <button onClick={() => setPrevia(null)} title="Fechar" className="p-1 rounded text-stone-400 hover:text-stone-700 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {!previa.length ? (
                <p className="text-xs text-stone-500">O público desta mensagem está vazio. Confira os critérios e recalcule o segmento.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {previa.map((p, i) => (
                    <div key={i} className="rounded-lg border border-stone-200 dark:border-stone-800 p-3">
                      <div className="text-[11px] font-semibold text-stone-400 mb-1">Para: {p.nome}</div>
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
