import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, Loader2, X } from 'lucide-react';
import { buscarServidorBM, importarPessoasBM } from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { NumberField } from './NumberField';
import { AvisoErro } from './AvisoErro';

interface ImportarBMModalProps {
  onFechar: () => void;
  /** Chamado ao fim de uma importação bem-sucedida, para recarregar a lista */
  onImportado: () => void;
}

/** de → para mostrado no modal: coluna do bmsoft → campo do CRM */
const DE_PARA: [string, string][] = [
  ['PESSOAS.ID', 'Cód.Integração: BM-<id> (chave)'],
  ['Nome', 'Nome'],
  ['Email', 'E-mail'],
  ['Fone1 / Celular / Fone2', 'Telefone'],
  ['CPFCNPJ', 'CPF'],
  ['Obs', 'Observação'],
];

interface Resultado {
  servidor: string;
  lidos: number;
  inseridos: number;
  atualizados: number;
  inalterados: number;
}

/** Importa as pessoas do bmsoft pela bmAPI, casando por PESSOAS.ID = cod_integracao */
export const ImportarBMModal: React.FC<ImportarBMModalProps> = ({ onFechar, onImportado }) => {
  const [servidor, setServidor] = useState('');
  /** Identificação do servidor digitado: texto, "procurando" ou o motivo de não achar */
  const [identificacao, setIdentificacao] = useState<{ texto: string; ok: boolean } | null>(null);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Cada número digitado busca a identificação do servidor (com uma pausa, para não
  // consultar a cada tecla)
  useEffect(() => {
    const numero = Number(servidor);
    if (!numero) {
      setIdentificacao(null);
      return;
    }
    let vivo = true;
    setIdentificacao({ texto: 'procurando…', ok: true });
    const t = setTimeout(async () => {
      try {
        const s = await buscarServidorBM(numero);
        if (vivo) setIdentificacao({ texto: s.identificacao, ok: true });
      } catch (err: any) {
        if (vivo) setIdentificacao({ texto: err.message || 'Servidor não encontrado.', ok: false });
      }
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [servidor]);

  const importar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number(servidor)) return setErro('Informe o número do servidor da bmAPI.');
    if (identificacao && !identificacao.ok) return setErro(identificacao.texto);
    setImportando(true);
    setErro(null);
    try {
      setResultado(await importarPessoasBM(Number(servidor)));
      onImportado();
    } catch (err: any) {
      setErro(err.message || 'Não foi possível importar as pessoas.');
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={importando ? undefined : onFechar} aria-hidden="true" />
      <form
        onSubmit={importar}
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10"
      >
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Importar pessoas do bmsoft</h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">Leitura direta da tabela PESSOAS pela bmAPI</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className={FIELD_CLASS}>
            <label htmlFor="imp-servidor" className={LABEL_CLASS}>
              Servidor da bmAPI<span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="flex items-center gap-3">
              <NumberField
                id="imp-servidor"
                value={servidor}
                onChange={setServidor}
                required
                disabled={importando || !!resultado}
                className={`${INPUT_CLASS} w-28`}
              />
              {identificacao && (
                <span
                  className={`text-xs font-semibold truncate ${
                    identificacao.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {identificacao.texto}
                </span>
              )}
            </div>
            <p className={HINT_CLASS}>Número do servidor cadastrado na bmAPI. Usuário e senha não são necessários.</p>
          </div>

          <div>
            <p className={`${LABEL_CLASS} mb-1.5`}>Campos importados</p>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
              {DE_PARA.map(([de, para]) => (
                <div key={de} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                  <span className="font-mono text-stone-500 dark:text-stone-400 w-44 shrink-0 truncate">{de}</span>
                  <ArrowRight className="w-3 h-3 text-stone-300 dark:text-stone-600 shrink-0" />
                  <span className="font-semibold text-stone-700 dark:text-stone-200 truncate">{para}</span>
                </div>
              ))}
            </div>
            <p className={`${HINT_CLASS} mt-1.5`}>
              Só entram as pessoas ativas. Quem já foi importado antes é atualizado; o resto é incluído.
            </p>
          </div>

          {resultado && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <div>
                <p className="font-semibold">Importação concluída — servidor {resultado.servidor}</p>
                <p className="mt-0.5">
                  {resultado.lidos} pessoa(s) lida(s): {resultado.inseridos} incluída(s), {resultado.atualizados} atualizada(s),{' '}
                  {resultado.inalterados} sem alteração.
                </p>
              </div>
            </div>
          )}

          {erro && (
            <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2.5 bg-stone-50 dark:bg-stone-950/40 rounded-b-2xl">
          <button
            type="button"
            onClick={onFechar}
            disabled={importando}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40"
          >
            {resultado ? 'Fechar' : 'Cancelar'}
          </button>
          {!resultado && (
            <button
              type="submit"
              disabled={importando}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer disabled:opacity-50"
            >
              {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{importando ? 'Importando…' : 'Importar'}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

/** Botão da barra de ferramentas da lista de pessoas, ao lado do "Novo" */
export const BotaoImportarBM: React.FC<{ onImportado: () => void }> = ({ onImportado }) => {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title="Importar as pessoas do bmsoft pela bmAPI"
        className="flex items-center gap-1.5 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Importar BM</span>
      </button>
      {aberto && <ImportarBMModal onFechar={() => setAberto(false)} onImportado={onImportado} />}
    </>
  );
};
