import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { updateRecord } from '../services/api';
import { RegistroCrud } from '../types';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { BotaoAcao } from './MenuAcoes';
import { AvisoErro } from './AvisoErro';

/**
 * "Concluir" da lista de Atividades/Tarefas: janela para escrever o resultado (o que foi feito) e marcar como
 * concluída. A data de conclusão, o negócio e a linha do tempo do chamado são acertados no servidor (regras.ts)
 */
export const AcaoConcluir: React.FC<{ registro: RegistroCrud; onFeito: () => void }> = ({ registro, onFeito }) => {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <BotaoAcao icone={CheckCircle2} titulo="Concluir" descricao="Marca como feita e registra o resultado" tom="verde" onClick={() => setAberta(true)} />
      {aberta &&
        createPortal(
          <JanelaConcluir
            registro={registro}
            onFechar={() => setAberta(false)}
            onFeito={() => {
              setAberta(false);
              onFeito();
            }}
          />,
          document.body,
        )}
    </>
  );
};

const JanelaConcluir: React.FC<{ registro: RegistroCrud; onFechar: () => void; onFeito: () => void }> = ({ registro, onFechar, onFeito }) => {
  const [resultado, setResultado] = useState(String(registro.resultado ?? ''));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !salvando && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar, salvando]);

  const concluir = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await updateRecord('atividades', registro.id as string, { concluida: 1, resultado: resultado.trim() || null });
      onFeito();
    } catch (err: any) {
      setErro(err.message || 'Não foi possível concluir a atividade.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={salvando ? undefined : onFechar} aria-hidden="true" />
      <form onSubmit={concluir} role="dialog" aria-modal="true" className="relative w-full max-w-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Concluir
            </h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{String(registro.assunto ?? '')}</p>
          </div>
          <button type="button" onClick={onFechar} title="Fechar" className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className={FIELD_CLASS}>
            <label htmlFor="atv-resultado" className={LABEL_CLASS}>Resultado</label>
            <textarea
              id="atv-resultado"
              autoFocus
              rows={4}
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              maxLength={4000}
              placeholder="O que foi feito, o que ficou combinado"
              className={`${INPUT_CLASS} w-full resize-y`}
            />
            <span className={HINT_CLASS}>Fica na atividade (coluna Resultado); pode ficar em branco</span>
          </div>
          {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
        </div>
        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2.5 bg-stone-50 dark:bg-stone-950/40 rounded-b-2xl">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40"
          >
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Concluir
          </button>
        </div>
      </form>
    </div>
  );
};
