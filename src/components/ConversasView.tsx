import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock, FileText, Loader2, MessageCircle, Search, SendHorizontal, User } from 'lucide-react';
import { ConversaResumo, MensagemWhatsApp, fetchConversa, fetchConversas, responderConversa } from '../services/api';
import { INPUT_CLASS } from '../utils/formStyles';
import { hojeIso } from '../utils/formatters';
import { AvisoErro } from './AvisoErro';

interface Props {
  refreshToken: number;
  /** Mensagens foram vistas: o menu recalcula a etiqueta de não vistas */
  onVisto: () => void;
}

/** 5547988438552 → +55 (47) 98843-8552; número de fora do Brasil fica só com o + */
export function formatarTelefoneWa(t: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(t);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${t}`;
}

const TIPOS: Record<string, string> = {
  imagem: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  documento: 'Documento',
  figurinha: 'Figurinha',
  localizacao: 'Localização',
  contato: 'Contato',
  outro: 'Mensagem não suportada',
};

/** Texto curto da última mensagem, para a lista */
const resumo = (m: { tipo: string; texto: string | null; arquivo_nome: string | null }) =>
  m.tipo === 'texto' ? m.texto || '' : `[${TIPOS[m.tipo] || m.tipo}] ${m.texto || m.arquivo_nome || ''}`.trim();

/** AAAA-MM-DD de ontem, no horário local (nunca toISOString) */
function ontemIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function rotuloDia(dia: string): string {
  if (dia === hojeIso()) return 'Hoje';
  if (dia === ontemIso()) return 'Ontem';
  return dataBr(dia);
}

/** Ícone da situação de uma mensagem enviada */
const Situacao: React.FC<{ s: MensagemWhatsApp['situacao'] }> = ({ s }) => {
  if (s === 'falhou') return <AlertCircle className="w-3.5 h-3.5 text-red-300" aria-label="Falhou" />;
  if (s === 'pendente') return <Clock className="w-3.5 h-3.5 opacity-70" aria-label="Enviando" />;
  if (s === 'enviada') return <Check className="w-3.5 h-3.5 opacity-70" aria-label="Enviada" />;
  if (s === 'entregue') return <CheckCheck className="w-3.5 h-3.5 opacity-70" aria-label="Entregue" />;
  if (s === 'lida') return <CheckCheck className="w-3.5 h-3.5 text-sky-300" aria-label="Lida" />;
  return null;
};

/** Conversas do WhatsApp: lista por telefone à esquerda, mensagens e resposta à direita */
export const ConversasView: React.FC<Props> = ({ refreshToken, onVisto }) => {
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [conversa, setConversa] = useState<{ pessoa: { id: number; nome: string } | null; mensagens: MensagemWhatsApp[] } | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const conversasRef = useRef(conversas);
  conversasRef.current = conversas;
  /** Quantas mensagens a conversa tinha: rola para o fim só quando chegam novas */
  const qtdRef = useRef(0);

  const carregarLista = useCallback(async () => {
    try {
      setConversas(await fetchConversas(busca));
    } catch (err: any) {
      setErro(err.message);
    }
  }, [busca]);

  // Lista: ao abrir, ao buscar (com uma pausa na digitação) e a cada 10 s
  useEffect(() => {
    const t = setTimeout(carregarLista, busca ? 300 : 0);
    const i = setInterval(() => !document.hidden && carregarLista(), 10_000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [carregarLista, refreshToken]);

  const carregarConversa = useCallback(
    async (telefone: string) => {
      try {
        const c = await fetchConversa(telefone);
        setConversa(c);
        // Abrir marca as recebidas como vistas: zera a etiqueta da conversa e a do menu
        if (conversasRef.current?.some((x) => x.telefone === telefone && x.nao_vistas)) {
          setConversas((lista) => lista?.map((x) => (x.telefone === telefone ? { ...x, nao_vistas: 0 } : x)) ?? lista);
          onVisto();
        }
      } catch (err: any) {
        setErro(err.message);
      }
    },
    [onVisto],
  );

  // Conversa aberta: ao abrir e a cada 5 s
  useEffect(() => {
    if (!aberta) return;
    setConversa(null);
    qtdRef.current = 0;
    carregarConversa(aberta);
    const i = setInterval(() => !document.hidden && carregarConversa(aberta), 5_000);
    return () => clearInterval(i);
  }, [aberta, carregarConversa, refreshToken]);

  // Mensagens novas: vai para o fim (a primeira carga também)
  useLayoutEffect(() => {
    const qtd = conversa?.mensagens.length ?? 0;
    if (qtd > qtdRef.current) fimRef.current?.scrollIntoView({ block: 'end' });
    qtdRef.current = qtd;
  }, [conversa]);

  const enviar = async () => {
    const t = texto.trim();
    if (!aberta || !t || enviando) return;
    setEnviando(true);
    try {
      await responderConversa(aberta, t);
      setTexto('');
      await Promise.all([carregarConversa(aberta), carregarLista()]);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const resumoAberta = conversas?.find((c) => c.telefone === aberta);
  const nomeAberta = conversa?.pessoa?.nome || resumoAberta?.nome || null;

  // Mensagens agrupadas por dia
  const dias: { dia: string; mensagens: MensagemWhatsApp[] }[] = [];
  for (const m of conversa?.mensagens ?? []) {
    const dia = m.data_hora.slice(0, 10);
    if (dias[dias.length - 1]?.dia !== dia) dias.push({ dia, mensagens: [] });
    dias[dias.length - 1].mensagens.push(m);
  }

  const linhas = Math.min(5, texto.split('\n').length);

  return (
    <div className="flex-1 min-h-0 flex bg-white dark:bg-stone-900">
      {/* Lista de conversas */}
      <aside className={`${aberta ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 xl:w-96 shrink-0 flex-col min-h-0 border-r border-stone-200 dark:border-stone-800`}>
        <div className="p-3 border-b border-stone-200 dark:border-stone-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Buscar por nome ou telefone"
              className={`${INPUT_CLASS} w-full pl-8`}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversas === null ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
            </div>
          ) : !conversas.length ? (
            <div className="p-6 text-xs text-center text-stone-500 dark:text-stone-400">
              {busca ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda. As mensagens recebidas aparecem aqui.'}
            </div>
          ) : (
            conversas.map((c) => {
              const dia = c.data_hora.slice(0, 10);
              const ativa = c.telefone === aberta;
              return (
                <button
                  key={c.telefone}
                  onClick={() => setAberta(c.telefone)}
                  className={`w-full text-left px-3 py-2.5 flex gap-3 items-center border-b border-stone-100 dark:border-stone-800/70 cursor-pointer transition-colors ${
                    ativa ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center shrink-0 font-semibold text-xs">
                    {c.nome ? c.nome.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-xs truncate ${c.nao_vistas ? 'font-bold text-stone-900 dark:text-white' : 'font-semibold text-stone-800 dark:text-stone-100'}`}>
                        {c.nome || formatarTelefoneWa(c.telefone)}
                      </span>
                      <span className={`text-[10px] shrink-0 ${c.nao_vistas ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-stone-400'}`}>
                        {dia === hojeIso() ? c.data_hora.slice(11, 16) : dataBr(dia).slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                        {c.direcao === 'enviada' && 'Você: '}
                        {resumo(c)}
                      </span>
                      {c.nao_vistas > 0 && (
                        <span className="text-[10px] font-bold leading-4 h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-white text-center shrink-0">
                          {c.nao_vistas > 99 ? '99+' : c.nao_vistas}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Conversa aberta */}
      <section className={`${aberta ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 flex-col min-h-0`}>
        {erro && (
          <div className="p-3">
            <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />
          </div>
        )}
        {!aberta ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-stone-400 bg-stone-50 dark:bg-stone-950/60">
            <MessageCircle className="w-8 h-8" />
            <span className="text-xs">Escolha uma conversa</span>
          </div>
        ) : (
          <>
            <header className="h-14 shrink-0 px-3 flex items-center gap-3 border-b border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setAberta(null)}
                title="Voltar para a lista"
                className="lg:hidden p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-900 dark:text-white truncate">{nomeAberta || formatarTelefoneWa(aberta)}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {nomeAberta ? formatarTelefoneWa(aberta) : 'Número sem cadastro em Pessoas'}
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 bg-stone-100 dark:bg-stone-950">
              {!conversa ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                </div>
              ) : (
                dias.map(({ dia, mensagens }) => (
                  <div key={dia}>
                    <div className="flex justify-center my-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 shadow-xs">
                        {rotuloDia(dia)}
                      </span>
                    </div>
                    {mensagens.map((m) => {
                      const minha = m.direcao === 'enviada';
                      const origem = minha ? (m.campanha ? 'Campanha' : m.usuario_nome) : null;
                      return (
                        <div key={m.id} className={`flex mb-1.5 ${minha ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug shadow-xs ${
                              minha
                                ? 'bg-blue-600 text-white rounded-br-md'
                                : 'bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-bl-md'
                            }`}
                          >
                            {origem && <div className={`text-[10px] font-semibold mb-0.5 ${minha ? 'text-blue-100' : ''}`}>{origem}</div>}
                            {m.tipo !== 'texto' && (
                              <div className={`flex items-center gap-1.5 italic text-xs mb-0.5 ${minha ? 'text-blue-100' : 'text-stone-500 dark:text-stone-400'}`}>
                                {m.tipo === 'documento' && <FileText className="w-3.5 h-3.5 shrink-0" />}
                                {m.tipo === 'documento' && m.arquivo_nome ? m.arquivo_nome : TIPOS[m.tipo] || m.tipo}
                              </div>
                            )}
                            {m.texto && <div className="whitespace-pre-wrap break-words">{m.texto}</div>}
                            <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] ${minha ? 'text-blue-100' : 'text-stone-400'}`}>
                              {m.data_hora.slice(11, 16)}
                              {minha && <Situacao s={m.situacao} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={fimRef} />
            </div>

            <div className="shrink-0 p-3 border-t border-stone-200 dark:border-stone-800 flex items-stretch gap-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envia; Shift+Enter quebra a linha
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                rows={linhas}
                maxLength={4000}
                placeholder="Digite a mensagem"
                title="Enter envia; Shift+Enter quebra a linha"
                className={`${INPUT_CLASS} flex-1 resize-none text-[13px]`}
              />
              <button
                onClick={enviar}
                disabled={enviando || !texto.trim()}
                title="Enviar pelo WhatsApp da empresa"
                className="flex items-center justify-center gap-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default shrink-0"
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
