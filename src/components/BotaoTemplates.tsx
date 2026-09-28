import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquareText, Search } from 'lucide-react';
import { fetchTemplatesAtivos, TemplateMensagem } from '../services/api';
import { INPUT_CLASS } from '../utils/formStyles';

/**
 * Botão "Templates" ao lado do campo da mensagem (WhatsApp e Chamados Ativos): abre para cima a lista dos
 * templates ativos do canal (Suporte › Templates), com busca; escolher coloca o texto no campo, com as
 * variáveis {{nome}}, {{primeiro_nome}} e {{atendente}} já trocadas. Fecha ao escolher, clicar fora ou Esc.
 */
export const BotaoTemplates: React.FC<{
  canal: 'whatsapp' | 'suporte';
  /** Valores das variáveis: nome do cliente e de quem envia */
  vars: { nome?: string | null; atendente?: string | null };
  onEscolher: (texto: string) => void;
  disabled?: boolean;
  className?: string;
}> = ({ canal, vars, onEscolher, disabled, className }) => {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<TemplateMensagem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    // Relê a cada abertura: quem mantém os templates pode ter mudado algo
    fetchTemplatesAtivos(canal)
      .then(setLista)
      .catch((e) => setErro(e.message));
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto, canal]);

  const nome = String(vars.nome ?? '').trim();
  const valores: Record<string, string> = { nome, primeiro_nome: nome.split(/\s+/)[0] ?? '', atendente: String(vars.atendente ?? '').trim() };
  const preencher = (texto: string) => texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (tudo, v) => (v in valores ? valores[v] : tudo));
  const termo = busca.trim().toLowerCase();
  const filtrados = (lista ?? []).filter((t) => !termo || t.descricao.toLowerCase().includes(termo) || t.texto.toLowerCase().includes(termo));

  return (
    <div ref={caixa} className="relative shrink-0 flex">
      <button
        type="button"
        onClick={() => {
          setBusca('');
          setErro(null);
          setAberto(!aberto);
        }}
        disabled={disabled}
        title="Templates de mensagem"
        aria-label="Templates de mensagem"
        className={className}
      >
        <MessageSquareText className="w-4 h-4" />
      </button>
      {aberto && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-80 max-w-[85vw] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl flex flex-col">
          <div className="p-2 border-b border-stone-200 dark:border-stone-800 relative">
            <Search className="w-3.5 h-3.5 absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtrados.length) {
                  e.preventDefault();
                  onEscolher(preencher(filtrados[0].texto));
                  setAberto(false);
                }
              }}
              placeholder="Buscar template"
              aria-label="Buscar template"
              className={`${INPUT_CLASS} w-full pl-7 text-xs`}
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {erro ? (
              <p className="px-3 py-2 text-xs text-rose-600">{erro}</p>
            ) : !lista ? (
              <Loader2 className="w-4 h-4 m-3 animate-spin text-stone-400" />
            ) : !filtrados.length ? (
              <p className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                {lista.length ? 'Nenhum template com esse texto.' : 'Nenhum template ativo. Cadastre em Suporte › Templates.'}
              </p>
            ) : (
              filtrados.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onEscolher(preencher(t.texto));
                    setAberto(false);
                  }}
                  title={t.texto}
                  className="w-full text-left px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  <div className="text-xs font-semibold text-stone-800 dark:text-stone-100 truncate">{t.descricao}</div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2 whitespace-pre-line">{t.texto}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
