import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, KeyRound, Loader2, X } from 'lucide-react';
import { conferirTokenBM, credencialBM, gravarTokenBM, importarBM, type CredencialBM } from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { AvisoErro } from './AvisoErro';

type Tipo = 'pessoas' | 'produtos';

interface ImportarBMModalProps {
  tipo: Tipo;
  onFechar: () => void;
  /** Chamado ao fim de uma importação bem-sucedida, para recarregar a lista */
  onImportado: () => void;
}

/** O que muda entre as importações: tabela, de → para (coluna do bmsoft → campo do CRM) e regra */
const TIPOS: Record<Tipo, { titulo: string; tabela: string; nome: string; dePara: [string, string][]; regra: string }> = {
  pessoas: {
    titulo: 'Importar pessoas do bmsoft',
    tabela: 'PESSOAS',
    nome: 'pessoa(s)',
    dePara: [
      ['PESSOAS.ID', 'Cód.Integração: BM-<id> (chave)'],
      ['Nome', 'Nome'],
      ['Email', 'E-mail'],
      ['Fone1 / Celular / Fone2', 'Telefone'],
      ['CPFCNPJ', 'CPF'],
      ['Obs', 'Observação'],
    ],
    regra: 'Só entram as pessoas ativas. Quem já foi importado antes é atualizado; o resto é incluído.',
  },
  produtos: {
    titulo: 'Importar produtos do bmsoft',
    tabela: 'PRODUTOSPRINCIPAL',
    nome: 'produto(s)',
    dePara: [
      ['PRODUTOSPRINCIPAL.ID', 'Cód.Integração: BM-<id> (chave) e SKU'],
      ['Descricao', 'Nome'],
      ['Texto', 'Descrição'],
      ['PrecoVenda1', 'Preço de Tabela'],
      ['UNVenda', 'Unidade'],
      ['Ativo', 'Ativo'],
    ],
    regra: 'Entram os produtos ativos. Os já importados são atualizados, inclusive desativados quando ficam inativos no bmsoft.',
  },
};

interface Resultado {
  servidor: string;
  lidos: number;
  inseridos: number;
  atualizados: number;
  inalterados: number;
}

/** Importa as pessoas do bmsoft pela bmAPI, casando por PESSOAS.ID = cod_integracao */
export const ImportarBMModal: React.FC<ImportarBMModalProps> = ({ tipo, onFechar, onImportado }) => {
  const t = TIPOS[tipo];
  /** Token gravado da empresa (null = carregando) */
  const [cred, setCred] = useState<CredencialBM | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [token, setToken] = useState('');
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    credencialBM()
      .then(setCred)
      .catch((err) => {
        setCred({ definido: false });
        setErro(err.message);
      });
  }, []);

  /** Pede o token: nenhum gravado, o gravado não vale mais, ou o usuário quer trocar */
  const pedeToken = Boolean(cred) && (!cred!.definido || Boolean(cred!.erro) || trocando);

  /** Servidor do token digitado: texto, "procurando" ou o motivo de não achar */
  const [identificacao, setIdentificacao] = useState<{ texto: string; ok: boolean } | null>(null);
  // Cada token digitado busca a identificação do servidor (com uma pausa, para não consultar a cada tecla)
  useEffect(() => {
    const t = token.trim();
    if (!t) {
      setIdentificacao(null);
      return;
    }
    let vivo = true;
    setIdentificacao({ texto: 'procurando…', ok: true });
    const espera = setTimeout(async () => {
      try {
        const r = await conferirTokenBM(t);
        if (vivo) setIdentificacao({ texto: r.servidor, ok: true });
      } catch (err: any) {
        if (vivo) setIdentificacao({ texto: err.message || 'Token não encontrado.', ok: false });
      }
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [token]);

  const importar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pedeToken && !token.trim()) return setErro('Informe o token da bmAPI.');
    if (pedeToken && identificacao && !identificacao.ok) return setErro(identificacao.texto);
    setImportando(true);
    setErro(null);
    try {
      // Token novo: grava primeiro (o servidor confere na bmAPI de qual servidor ele é)
      if (pedeToken) {
        setCred(await gravarTokenBM(token.trim()));
        setTrocando(false);
        setToken('');
      }
      setResultado(await importarBM(tipo));
      onImportado();
    } catch (err: any) {
      setErro(err.message || `Não foi possível importar ${tipo === 'pessoas' ? 'as pessoas' : 'os produtos'}.`);
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
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">{t.titulo}</h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">Leitura direta da tabela {t.tabela} pela bmAPI</p>
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
          {!cred ? (
            <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
          ) : pedeToken ? (
            <div className={FIELD_CLASS}>
              <label htmlFor="imp-token" className={LABEL_CLASS}>
                Token da bmAPI<span className="text-rose-500 ml-1">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="imp-token"
                  type="password"
                  autoFocus
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  maxLength={64}
                  disabled={importando || !!resultado}
                  className={`${INPUT_CLASS} w-44 shrink-0`}
                />
                {identificacao && (
                  <span
                    className={`text-xs font-semibold truncate min-w-0 flex-1 ${
                      identificacao.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                    title={identificacao.texto}
                  >
                    {identificacao.texto}
                  </span>
                )}
                {trocando && (
                  <button type="button" onClick={() => setTrocando(false)} className="text-xs font-semibold text-stone-500 hover:underline cursor-pointer">
                    Cancelar
                  </button>
                )}
              </div>
              {cred.erro && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">Token gravado não vale mais: {cred.erro}</p>}
              <p className={HINT_CLASS}>
                O token (X-API-Key) do servidor da bmAPI. Ele identifica o servidor e fica gravado, cifrado, para as próximas importações.
              </p>
            </div>
          ) : (
            <div className={FIELD_CLASS}>
              <span className={LABEL_CLASS}>Servidor da bmAPI</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> {cred.servidor}
                </span>
                {!resultado && (
                  <button type="button" onClick={() => setTrocando(true)} disabled={importando} className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer disabled:opacity-40">
                    Trocar token
                  </button>
                )}
              </div>
              <p className={HINT_CLASS}>Token gravado: o servidor vem dele.</p>
            </div>
          )}

          <div>
            <p className={`${LABEL_CLASS} mb-1.5`}>Campos importados</p>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
              {t.dePara.map(([de, para]) => (
                <div key={de} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                  <span className="font-mono text-stone-500 dark:text-stone-400 w-44 shrink-0 truncate">{de}</span>
                  <ArrowRight className="w-3 h-3 text-stone-300 dark:text-stone-600 shrink-0" />
                  <span className="font-semibold text-stone-700 dark:text-stone-200 truncate">{para}</span>
                </div>
              ))}
            </div>
            <p className={`${HINT_CLASS} mt-1.5`}>
              {t.regra}
            </p>
          </div>

          {resultado && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <div>
                <p className="font-semibold">Importação concluída — servidor {resultado.servidor}</p>
                <p className="mt-0.5">
                  {resultado.lidos} {t.nome} lido(s): {resultado.inseridos} incluído(s), {resultado.atualizados} atualizado(s),{' '}
                  {resultado.inalterados} sem alteração.
                  {resultado.inativos ? ` ${resultado.inativos} inativo(s) no bmsoft ficaram de fora.` : ''}
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
              disabled={importando || !cred}
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
export const BotaoImportarBM: React.FC<{ tipo: Tipo; onImportado: () => void }> = ({ tipo, onImportado }) => {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title={`Importar ${tipo === 'pessoas' ? 'as pessoas' : 'os produtos'} do bmsoft pela bmAPI`}
        className="flex items-center gap-1.5 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Importar BM</span>
      </button>
      {aberto && <ImportarBMModal tipo={tipo} onFechar={() => setAberto(false)} onImportado={onImportado} />}
    </>
  );
};
