import React, { useEffect, useRef, useState } from 'react';
import { FileText, Image as Imagem, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { AnexoProposta, enviarAnexoProposta, excluirAnexoProposta, fetchAnexosProposta } from '../services/api';
import { Id } from '../types';
import { formatDateTimeBR } from '../utils/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { AvisoErro } from './AvisoErro';

const MAX = 25 * 1024 * 1024;

/** 1.234.567 bytes → "1,2 MB" */
const tamanho = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * Anexos da proposta (PDFs, imagens...), no Vercel Blob: ligados ao número da proposta, aparecem em todas as
 * versões. Proposta ainda não salva não tem número: pede para salvar antes.
 */
export const AnexosProposta: React.FC<{ id: Id | null; empresaId: Id | null; numero: Id | null; bloqueado: boolean; onToast: (msg: string) => void }> = ({
  id,
  empresaId,
  numero,
  bloqueado,
  onToast,
}) => {
  const [anexos, setAnexos] = useState<AnexoProposta[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<AnexoProposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const carregar = () => {
    if (!id) return;
    fetchAnexosProposta(id).then(setAnexos).catch((e) => setErro(e.message));
  };
  useEffect(carregar, [id]);

  const enviar = async (lista: FileList | null) => {
    if (!lista?.length || !id || !empresaId || !numero) return;
    setErro(null);
    let ok = 0;
    for (const arquivo of Array.from(lista)) {
      if (arquivo.size > MAX) {
        setErro(`"${arquivo.name}" tem ${tamanho(arquivo.size)}: o limite é 25 MB por arquivo.`);
        continue;
      }
      setEnviando(arquivo.name);
      try {
        await enviarAnexoProposta(id, empresaId, numero, arquivo);
        ok++;
      } catch (e: any) {
        setErro(`"${arquivo.name}": ${e.message || 'não foi possível enviar.'}`);
      }
    }
    setEnviando(null);
    if (arquivoRef.current) arquivoRef.current.value = '';
    if (ok) onToast(ok === 1 ? 'Anexo incluído.' : `${ok} anexos incluídos.`);
    carregar();
  };

  return (
    <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-stone-50 dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-stone-700 dark:text-stone-200">Anexos ({anexos.length})</span>
        {id && !bloqueado && (
          <>
            <input ref={arquivoRef} type="file" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
            <button
              type="button"
              disabled={Boolean(enviando)}
              onClick={() => arquivoRef.current?.click()}
              title="PDFs, imagens ou outros arquivos (até 25 MB cada). Valem para todas as versões da proposta"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-50"
            >
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              {enviando ? `Enviando ${enviando}…` : 'Anexar arquivos'}
            </button>
          </>
        )}
      </div>
      {erro && (
        <div className="p-3">
          <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />
        </div>
      )}
      {!id ? (
        <p className="px-4 py-4 text-xs text-stone-500 dark:text-stone-400">Salve a proposta para anexar arquivos.</p>
      ) : !anexos.length ? (
        <p className="px-4 py-4 text-xs text-stone-500 dark:text-stone-400">Nenhum anexo. Os anexos valem para todas as versões desta proposta.</p>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800/60">
          {anexos.map((a) => (
            <li key={a.id} className="px-4 py-2 flex items-center gap-3 text-xs">
              {a.tipo?.startsWith('image/') ? <Imagem className="w-4 h-4 text-stone-400 shrink-0" /> : <FileText className="w-4 h-4 text-stone-400 shrink-0" />}
              <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate font-semibold text-blue-700 dark:text-blue-400 hover:underline">
                {a.nome}
              </a>
              <span className="text-right text-stone-500 tabular-nums w-16 shrink-0">{tamanho(a.tamanho)}</span>
              <span className="text-center text-stone-500 w-32 shrink-0">{formatDateTimeBR(a.criado_em)}</span>
              <span className="text-stone-500 w-24 truncate shrink-0">{a.usuario_nome || '—'}</span>
              {!bloqueado && (
                <button
                  type="button"
                  onClick={() => setExcluindo(a)}
                  title="Excluir o anexo (de todas as versões)"
                  className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {excluindo && (
        <ConfirmDialog
          titulo="Excluir anexo?"
          mensagem={<><strong>{excluindo.nome}</strong> sai desta proposta e de todas as versões dela, e o arquivo é apagado.</>}
          confirmar="Excluir"
          onConfirmar={async () => {
            await excluirAnexoProposta(id!, excluindo.id);
            setExcluindo(null);
            onToast('Anexo excluído.');
            carregar();
          }}
          onCancelar={() => setExcluindo(null)}
        />
      )}
    </div>
  );
};
