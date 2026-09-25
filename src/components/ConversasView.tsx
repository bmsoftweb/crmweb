import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Bot, Building2, Check, CheckCheck, Clock, FileText, Hash, Loader2, MessageCircle, MessageSquarePlus, Search, SendHorizontal, User, UserPlus, X } from 'lucide-react';
import { ConversaResumo, DestinoConversa, MensagemWhatsApp, createRecord, fetchDestinosConversa, fetchNumeroConversa, mudarAtendimentoConversa, fetchConversa, fetchOptions, fetchConversaDaAtividade, fetchConversas, responderConversa } from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { hojeIso } from '../utils/formatters';
import { OpcaoRef } from '../types';
import { SelectBusca } from './SelectBusca';
import { AvisoErro } from './AvisoErro';

/** Quem pediu para abrir uma conversa (seq muda a cada clique) */
export interface PedidoConversa {
  /** Atividade WhatsApp da ficha do negócio: enviar a mensagem a conclui */
  atividadeId?: string | number;
  /** Ícone do WhatsApp nas listas de Pessoas e de Contatos */
  pessoaId?: string | number;
  contatoId?: string | number;
  seq: number;
}

interface Props {
  refreshToken: number;
  /** Mensagens foram vistas: o menu recalcula a etiqueta de não vistas */
  onVisto: () => void;
  /** Aberta pela atividade WhatsApp da ficha do negócio, ou por uma pessoa/contato das listas */
  pedido?: PedidoConversa | null;
  onToast: (msg: string) => void;
}

/** 5547988438552 → +55 (47) 98843-8552; número de fora do Brasil fica só com o + */
export function formatarTelefoneWa(t: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(t);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${t}`;
}

/**
 * Número da conversa → telefone para o cadastro: (47) 98843-8552. O WhatsApp costuma guardar o
 * celular sem o 9; número de 8 dígitos começando em 6-9 é celular e ganha o 9 de volta.
 */
export function telefoneCadastro(t: string): string {
  const m = /^55(\d{2})(\d{8,9})$/.exec(t);
  if (!m) return `+${t}`;
  const numero = m[2].length === 8 && /^[6-9]/.test(m[2]) ? `9${m[2]}` : m[2];
  return `(${m[1]}) ${numero.slice(0, -4)}-${numero.slice(-4)}`;
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
export const ConversasView: React.FC<Props> = ({ refreshToken, onVisto, pedido, onToast }) => {
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [conversa, setConversa] = useState<Awaited<ReturnType<typeof fetchConversa>> | null>(null);
  /** Cadastro rápido em Pessoas de um número sem cadastro */
  const [cadastrando, setCadastrando] = useState<{ telefone: string; nome: string } | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Atividade que abriu a conversa: enviar a mensagem a conclui */
  const [atividade, setAtividade] = useState<{ id: number; assunto: string; telefone: string } | null>(null);
  /** Nome de quem ainda não tem conversa (vem da atividade) */
  const [nomePedido, setNomePedido] = useState<string | null>(null);
  /** Nova conversa: busca de pessoa/contato aberta, e o nome de quem foi escolhido (antes da 1ª mensagem) */
  const [novaAberta, setNovaAberta] = useState(false);
  const [escolhido, setEscolhido] = useState<{ telefone: string; nome: string } | null>(null);
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

  // Clique na atividade WhatsApp da ficha do negócio: abre o número do cliente
  useEffect(() => {
    if (!pedido) return;
    if (!pedido.atividadeId) {
      fetchNumeroConversa({ pessoaId: pedido.pessoaId, contatoId: pedido.contatoId })
        .then((r) => {
          setEscolhido({ telefone: r.telefone, nome: r.nome });
          setAberta(r.telefone);
        })
        .catch((err) => setErro(err.message));
      return;
    }
    fetchConversaDaAtividade(pedido.atividadeId)
      .then((r) => {
        setAberta(r.telefone);
        setNomePedido(r.nome);
        setAtividade(r.atividade.concluida ? null : { id: r.atividade.id, assunto: r.atividade.assunto, telefone: r.telefone });
      })
      .catch((err) => setErro(err.message));
  }, [pedido?.seq]);

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
      const vinculada = atividade?.telefone === aberta ? atividade : null;
      const r = await responderConversa(aberta, t, vinculada?.id);
      setTexto('');
      if (vinculada) {
        setAtividade(null);
        if (r.atividade_concluida) onToast(`Atividade "${vinculada.assunto}" concluída.`);
      }
      // O WhatsApp pode guardar o número sem o 9: a conversa passa a ser a dele
      if (r.telefone && r.telefone !== aberta) setAberta(r.telefone);
      else await carregarConversa(aberta);
      await carregarLista();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const resumoAberta = conversas?.find((c) => c.telefone === aberta);
  const nomeAberta =
    conversa?.pessoa?.nome ||
    resumoAberta?.nome ||
    (atividade?.telefone === aberta ? nomePedido : null) ||
    (escolhido?.telefone === aberta ? escolhido.nome : null);
  /** O número é de um contato da pessoa: "João Silva (Compras)" */
  const contatoAberta = conversa?.contato
    ? `${conversa.contato.nome}${conversa.contato.departamento || conversa.contato.cargo ? ` (${conversa.contato.departamento || conversa.contato.cargo})` : ''}`
    : resumoAberta?.contato_nome
      ? `${resumoAberta.contato_nome}${resumoAberta.contato_setor ? ` (${resumoAberta.contato_setor})` : ''}`
      : null;
  /** Nome do perfil no WhatsApp, para quem não está em Pessoas */
  const perfilAberta = conversa?.nome_contato || resumoAberta?.nome_contato || null;

  const aoCadastrar = async (telefone: string) => {
    setCadastrando(null);
    onToast('Pessoa cadastrada e ligada à conversa.');
    // Abrir a conversa liga as mensagens à pessoa nova (pelo telefone)
    if (telefone === aberta) await carregarConversa(telefone);
    else setAberta(telefone);
    await carregarLista();
  };

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
        <div className="p-3 border-b border-stone-200 dark:border-stone-800 flex items-stretch gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Buscar por nome ou telefone"
              className={`${INPUT_CLASS} w-full pl-8`}
            />
          </div>
          <button
            onClick={() => setNovaAberta(true)}
            title="Nova conversa com uma pessoa, um contato ou um número"
            className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova</span>
          </button>
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
                  {c.nome ? (
                    <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0 font-semibold text-xs">
                      {(c.contato_nome || c.nome).charAt(0).toUpperCase()}
                    </div>
                  ) : (
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCadastrando({ telefone: c.telefone, nome: c.nome_contato || '' });
                      }}
                      title="Não cadastrado: cadastrar em Pessoas"
                      className="w-9 h-9 rounded-full border border-dashed border-stone-300 dark:border-stone-600 text-stone-400 hover:text-blue-600 hover:border-blue-400 dark:hover:text-blue-400 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">
                        <span className={`text-xs ${c.nao_vistas ? 'font-bold text-stone-900 dark:text-white' : 'font-semibold text-stone-800 dark:text-stone-100'}`}>
                          {c.contato_nome || c.nome || c.nome_contato || formatarTelefoneWa(c.telefone)}
                        </span>
                        {c.contato_nome && (
                          <span className="ml-1.5 text-[10px] text-stone-500 dark:text-stone-400">
                            {c.contato_setor ? `${c.contato_setor} · ` : ''}
                            {c.nome}
                          </span>
                        )}
                        {!c.contato_nome && (c.nome || c.nome_contato) && <span className="ml-1.5 text-[10px] text-stone-400">{formatarTelefoneWa(c.telefone)}</span>}
                        {!c.nome && <span className="ml-1.5 text-[10px] italic text-amber-600 dark:text-amber-400">não cadastrado</span>}
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
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-stone-900 dark:text-white truncate">{contatoAberta || nomeAberta || perfilAberta || formatarTelefoneWa(aberta)}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {contatoAberta && nomeAberta && <span className="font-semibold text-stone-600 dark:text-stone-300">{nomeAberta} · </span>}
                  {nomeAberta || perfilAberta ? formatarTelefoneWa(aberta) : ''}
                  {!nomeAberta && (
                    <span className="italic text-amber-600 dark:text-amber-400">{perfilAberta ? ' · ' : ''}não cadastrado em Pessoas</span>
                  )}
                </div>
              </div>
              {conversa?.atendimento && (
                <div className="shrink-0 flex items-center gap-2">
                  <span
                    className={`hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      conversa.atendimento === 'bot'
                        ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    }`}
                  >
                    {conversa.atendimento === 'bot' ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    {conversa.atendimento === 'bot' ? 'Bot atendendo' : 'Humano atendendo'}
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        const novo = conversa.atendimento === 'bot' ? 'humano' : 'bot';
                        await mudarAtendimentoConversa(aberta, novo);
                        onToast(novo === 'humano' ? 'Você assumiu a conversa: o bot não responde mais.' : 'Conversa devolvida ao bot.');
                        await carregarConversa(aberta);
                      } catch (err: any) {
                        setErro(err.message);
                      }
                    }}
                    title={conversa.atendimento === 'bot' ? 'O bot para de responder esta conversa' : 'O bot volta a responder esta conversa'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                  >
                    {conversa.atendimento === 'bot' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    {conversa.atendimento === 'bot' ? 'Assumir' : 'Devolver ao bot'}
                  </button>
                </div>
              )}
              {conversa && !nomeAberta && (
                <button
                  onClick={() => setCadastrando({ telefone: aberta, nome: perfilAberta || '' })}
                  title="Cadastrar este número em Pessoas"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Cadastrar
                </button>
              )}
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
                      const origem = minha ? (m.bot ? 'Bot' : m.campanha ? 'Campanha' : m.automatica ? 'Automática' : m.usuario_nome) : null;
                      return (
                        <div key={m.id} title={m.erro ? `Não enviada: ${m.erro}` : undefined} className={`flex mb-1.5 ${minha ? 'justify-end' : 'justify-start'}`}>
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

            {atividade?.telefone === aberta && (
              <div className="shrink-0 px-3 py-2 border-t border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-300">
                <span className="min-w-0 truncate">
                  Atividade <b>{atividade.assunto}</b>: enviar a mensagem conclui a atividade.
                </span>
                <button
                  onClick={() => setAtividade(null)}
                  title="Conversar sem concluir a atividade"
                  className="shrink-0 font-semibold hover:underline cursor-pointer"
                >
                  Não concluir
                </button>
              </div>
            )}
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

      {novaAberta && (
        <NovaConversa
          onFechar={() => setNovaAberta(false)}
          onEscolher={(d) => {
            setNovaAberta(false);
            setEscolhido({ telefone: d.telefone!, nome: d.tipo === 'numero' ? '' : d.nome });
            setAberta(d.telefone);
          }}
        />
      )}

      {cadastrando && <CadastroRapido {...cadastrando} onFechar={() => setCadastrando(null)} onCadastrado={() => aoCadastrar(cadastrando.telefone)} />}
    </div>
  );
};

/**
 * Nova conversa: procura pessoas e contatos pelo nome ou pelo número (ou aceita um número digitado)
 * e abre a conversa com o WhatsApp de quem for escolhido
 */
const NovaConversa: React.FC<{ onFechar: () => void; onEscolher: (d: DestinoConversa) => void }> = ({ onFechar, onEscolher }) => {
  const [busca, setBusca] = useState('');
  const [destinos, setDestinos] = useState<DestinoConversa[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Busca com uma pausa na digitação; a resposta de uma busca antiga não sobrescreve a nova
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) {
      setDestinos(null);
      return;
    }
    let vivo = true;
    setCarregando(true);
    const t = setTimeout(() => {
      fetchDestinosConversa(termo)
        .then((l) => vivo && setDestinos(l))
        .catch((err) => vivo && setErro(err.message))
        .finally(() => vivo && setCarregando(false));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [busca]);

  const Icone = ({ tipo }: { tipo: DestinoConversa['tipo'] }) =>
    tipo === 'contato' ? <User className="w-4 h-4" /> : tipo === 'numero' ? <Hash className="w-4 h-4" /> : <Building2 className="w-4 h-4" />;

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center p-4 pt-[10vh]">
      <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={onFechar} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Nova conversa" className="relative w-full max-w-lg max-h-[75vh] flex flex-col bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Nova conversa</h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">Procure uma pessoa, um contato de uma pessoa, ou digite o número com DDD.</p>
          </div>
          <button type="button" onClick={onFechar} title="Fechar" className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 border-b border-stone-200 dark:border-stone-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                // Enter abre o primeiro que dá para mandar
                const primeiro = destinos?.find((d) => d.telefone);
                if (e.key === 'Enter' && primeiro) onEscolher(primeiro);
                if (e.key === 'Escape') onFechar();
              }}
              placeholder="Nome, empresa ou telefone"
              className={`${INPUT_CLASS} w-full pl-8`}
            />
            {carregando && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />}
          </div>
          {erro && (
            <div className="mt-2">
              <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {destinos === null ? (
            <p className="p-5 text-xs text-center text-stone-500 dark:text-stone-400">Digite pelo menos 2 letras ou números.</p>
          ) : !destinos.length ? (
            <p className="p-5 text-xs text-center text-stone-500 dark:text-stone-400">Nada encontrado em Pessoas nem em Contatos.</p>
          ) : (
            destinos.map((d) => (
              <button
                key={`${d.tipo}-${d.contato_id ?? d.pessoa_id ?? d.telefone}`}
                disabled={!d.telefone}
                onClick={() => onEscolher(d)}
                title={d.telefone ? `Abrir a conversa com ${formatarTelefoneWa(d.telefone)}` : `Sem como mandar WhatsApp: ${d.aviso}`}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-stone-100 dark:border-stone-800/70 hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    d.tipo === 'contato' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                  }`}
                >
                  <Icone tipo={d.tipo} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-stone-800 dark:text-stone-100 truncate">
                    {d.nome}
                    {d.tipo === 'contato' && <span className="ml-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">contato</span>}
                  </span>
                  <span className="block text-[11px] text-stone-500 dark:text-stone-400 truncate">
                    {d.detalhe ? `${d.detalhe} · ` : ''}
                    {d.telefone ? formatarTelefoneWa(d.telefone) : <span className="italic text-amber-600 dark:text-amber-400">{d.aviso}</span>}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/** Cadastro rápido em Pessoas (lead) de quem mandou mensagem e ainda não está cadastrado */
const CadastroRapido: React.FC<{ telefone: string; nome: string; onFechar: () => void; onCadastrado: () => void }> = ({
  telefone,
  nome: nomeInicial,
  onFechar,
  onCadastrado,
}) => {
  /** Nova pessoa (lead) ou contato de uma pessoa que já existe */
  const [modo, setModo] = useState<'pessoa' | 'contato'>('pessoa');
  const [nome, setNome] = useState(nomeInicial);
  const [fone, setFone] = useState(telefoneCadastro(telefone));
  const [email, setEmail] = useState('');
  const [pessoaId, setPessoaId] = useState('');
  const [cargo, setCargo] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [pessoas, setPessoas] = useState<OpcaoRef[] | null>(null);
  // A lista de pessoas só é carregada quando se escolhe "contato"
  useEffect(() => {
    if (modo !== 'contato' || pessoas) return;
    fetchOptions('pessoas', 'nome')
      .then(setPessoas)
      .catch((err) => setErro(err.message));
  }, [modo, pessoas]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = `${INPUT_CLASS} w-full`;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      if (modo === 'pessoa') {
        await createRecord('pessoas', { tipo: 'lead', nome: nome.trim(), whatsapp: fone.trim(), email: email.trim() || null });
      } else {
        if (!pessoaId) throw new Error('Escolha a pessoa (empresa-cliente) do contato.');
        await createRecord('pessoas_contatos', {
          pessoa_id: pessoaId,
          nome: nome.trim(),
          whatsapp: fone.trim(),
          celular: fone.trim(),
          email: email.trim() || null,
          cargo: cargo.trim() || null,
          departamento: departamento.trim() || null,
        });
      }
      onCadastrado();
    } catch (err: any) {
      setErro(err.message || 'Não foi possível cadastrar.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={salvando ? undefined : onFechar} aria-hidden="true" />
      <form onSubmit={salvar} role="dialog" aria-modal="true" className="relative w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Cadastrar este número</h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {modo === 'pessoa' ? 'Nova pessoa, como lead; o restante do cadastro fica em Pessoas.' : 'Contato de uma pessoa que já está cadastrada (ex.: o comprador de um cliente).'}
            </p>
          </div>
          <button type="button" onClick={onFechar} title="Fechar" className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-stone-100 dark:bg-stone-800">
            {(
              [
                ['pessoa', 'Nova pessoa'],
                ['contato', 'Contato de uma pessoa'],
              ] as const
            ).map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                onClick={() => setModo(v)}
                aria-pressed={modo === v}
                className={`py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                  modo === v ? 'bg-white dark:bg-stone-900 text-blue-700 dark:text-blue-300 shadow-xs' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {modo === 'contato' && (
            <div className={FIELD_CLASS}>
              <label htmlFor="cad-pessoa" className={LABEL_CLASS}>Pessoa (empresa-cliente)</label>
              {pessoas ? (
                <SelectBusca id="cad-pessoa" value={pessoaId} options={pessoas} onChange={setPessoaId} required vazioLabel="— Escolha —" className={campo} />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
              )}
            </div>
          )}
          <div className={FIELD_CLASS}>
            <label htmlFor="cad-nome" className={LABEL_CLASS}>{modo === 'pessoa' ? 'Nome' : 'Nome do contato'}</label>
            <input id="cad-nome" autoFocus required maxLength={255} value={nome} onChange={(e) => setNome(e.target.value)} onFocus={(e) => e.target.select()} className={campo} />
            {nomeInicial && <span className={HINT_CLASS}>Sugerido pelo nome do perfil no WhatsApp</span>}
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="cad-fone" className={LABEL_CLASS}>WhatsApp</label>
            <input id="cad-fone" required maxLength={50} value={fone} onChange={(e) => setFone(e.target.value)} onFocus={(e) => e.target.select()} className={campo} />
          </div>
          {modo === 'contato' && (
            <div className="grid grid-cols-2 gap-3">
              <div className={FIELD_CLASS}>
                <label htmlFor="cad-cargo" className={LABEL_CLASS}>Cargo</label>
                <input id="cad-cargo" maxLength={100} value={cargo} onChange={(e) => setCargo(e.target.value)} onFocus={(e) => e.target.select()} className={campo} />
              </div>
              <div className={FIELD_CLASS}>
                <label htmlFor="cad-depto" className={LABEL_CLASS}>Departamento</label>
                <input id="cad-depto" maxLength={100} value={departamento} onChange={(e) => setDepartamento(e.target.value)} onFocus={(e) => e.target.select()} className={campo} />
              </div>
            </div>
          )}
          <div className={FIELD_CLASS}>
            <label htmlFor="cad-email" className={LABEL_CLASS}>E-mail</label>
            <input id="cad-email" type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} onFocus={(e) => e.target.select()} className={campo} />
          </div>
          {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
        </div>
        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2.5 bg-stone-50 dark:bg-stone-950/40 rounded-b-2xl">
          <button type="button" onClick={onFechar} disabled={salvando} className="px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Cadastrar
          </button>
        </div>
      </form>
    </div>
  );
};
