import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Bell, CheckCircle2, Hand, Inbox, Loader2, Lock, MessageCircle, MonitorSmartphone, Pause, Search, Send, StickyNote } from 'lucide-react';
import {
  assumirChamado,
  buscarPessoasChamado,
  ChamadoDetalhe,
  ChamadoResumo,
  criarChamado,
  encerrarChamado,
  enviarMensagemChamado,
  fetchChamado,
  fetchChamados,
  fetchFilaChamados,
  cutucarCliente,
  pausarChamado,
  fetchOptions,
  FiltroChamados,
  pedirTelaRemota,
  transferirChamado,
} from '../services/api';
import { OpcaoRef } from '../types';
import { formatDateTimeBR } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { ConfirmDialog } from './ConfirmDialog';
import { AvisoErro } from './AvisoErro';
import { Toggle } from './Toggle';

/**
 * Suporte › Fila de Chamados e Chamados Ativos (server/chamados.ts), no modelo do solweb: a fila
 * em ordem de chegada com "Assumir"; os ativos em lista (filtros rápidos) + chamado aberto, com
 * resposta ao cliente (vai pelo WhatsApp) ou nota interna, transferir e encerrar.
 */

/** Mensagem "Tela remota" (a mesma de server/chamados.ts) */
const TELA_REMOTA = '[[anydesk]]';
/** Mensagem "Cutucar" (a mesma de server/chamados.ts) */
const CUTUCAR = '[[cutucar]]';
/** Número do AnyDesk que o cliente mandou pelo chat do site (server/suporte.ts) */
const ID_ANYDESK = /^\[\[anydesk-id:(\d+)\]\]$/;
const formatarAnydesk = (id: string) => id.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Abre o AnyDesk do técnico já conectando ao cliente (protocolo anydesk:<número>).
 * onClick roda antes (pedido de tela remota no chat do cliente); o link abre em seguida,
 * ainda no clique, porque o navegador só chama o AnyDesk com um gesto do usuário.
 */
const Conectar: React.FC<{ id: string; grande?: boolean; onClick?: () => void }> = ({ id, grande, onClick }) => (
  <a
    href={`anydesk:${id}`}
    onClick={onClick}
    title={`Abre o seu AnyDesk conectando em ${formatarAnydesk(id)}`}
    className={`inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold ${grande ? 'px-3 py-1.5 text-xs' : 'px-2 py-1 text-[11px]'}`}
  >
    <MonitorSmartphone className="w-3.5 h-3.5" /> Conectar {formatarAnydesk(id)}
  </a>
);

const PRIORIDADE: Record<string, string> = {
  urgente: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  alta: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  normal: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  baixa: 'bg-stone-50 text-stone-500 dark:bg-stone-900 dark:text-stone-400',
};
const STATUS: Record<string, [string, string]> = {
  aguardando: ['Aguardando', 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'],
  em_andamento: ['Em andamento', 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'],
  pausado: ['Pausado', 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'],
  pendente_cliente: ['Pendente cliente', 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'],
  encerrado: ['Encerrado', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'],
  cancelado: ['Cancelado', 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'],
};

const Etiqueta: React.FC<{ classe: string; children: React.ReactNode }> = ({ classe, children }) => (
  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${classe}`}>{children}</span>
);
const Prioridade: React.FC<{ p: string }> = ({ p }) => <Etiqueta classe={PRIORIDADE[p] || PRIORIDADE.normal}>{p}</Etiqueta>;
const Status: React.FC<{ s: string }> = ({ s }) => <Etiqueta classe={STATUS[s]?.[1] || ''}>{STATUS[s]?.[0] || s}</Etiqueta>;
const Categoria: React.FC<{ c: ChamadoResumo }> = ({ c }) =>
  c.categoria_nome ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-stone-600 dark:text-stone-300 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.categoria_cor || '#a8a29e' }} />
      {c.categoria_nome}
    </span>
  ) : null;
const Sla: React.FC = () => (
  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
    <AlertTriangle className="w-3 h-3" /> SLA vencido
  </span>
);

/** "45 min", "3 h 10 min", "2 d 4 h" */
export function tempoEspera(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return `${Math.floor(min / 1440)} d${Math.floor((min % 1440) / 60) ? ` ${Math.floor((min % 1440) / 60)} h` : ''}`;
}

/** Atualiza a cada 15 s (outros atendentes mexem nos chamados ao mesmo tempo) */
function useRecarga(fn: () => void, deps: unknown[]) {
  useEffect(() => {
    fn();
    const i = setInterval(fn, 15_000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ------------------------------------------------------------
// Fila de Chamados
// ------------------------------------------------------------

interface FilaProps {
  refreshToken: number;
  /** Chamado assumido: abre em Chamados Ativos */
  onAbrir: (id: number) => void;
  onMudou: () => void;
  onToast: (msg: string) => void;
}

export const ChamadosFila: React.FC<FilaProps> = ({ refreshToken, onAbrir, onMudou, onToast }) => {
  const [fila, setFila] = useState<ChamadoResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [assumindo, setAssumindo] = useState<number | null>(null);

  const carregar = useCallback(() => {
    fetchFilaChamados()
      .then(setFila)
      .catch((e) => setErro(e.message));
  }, []);
  useRecarga(carregar, [refreshToken]);

  const assumir = async (c: ChamadoResumo) => {
    setAssumindo(c.id);
    try {
      await assumirChamado(c.id);
      onToast(`Chamado nº ${c.numero} assumido.`);
      onMudou();
      onAbrir(c.id);
    } catch (e: any) {
      setErro(e.message);
      carregar();
    } finally {
      setAssumindo(null);
    }
  };

  // Mesmo visual das listas do app (CrudView): painel chapado, barra no topo e grade de ponta a ponta
  const th = 'px-3 py-2.5 font-semibold text-stone-600 dark:text-stone-300 border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 whitespace-nowrap';
  const td = 'px-3 py-[7.5px] border-b border-r border-stone-100 dark:border-stone-800/60';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0">
        <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate min-w-0">
          Chamados aguardando atendimento, em ordem de chegada. Quem assume passa a atender em Chamados Ativos.
        </div>
        <span className="text-xs text-stone-500 dark:text-stone-400 shrink-0">
          Na fila: <strong className="text-stone-900 dark:text-stone-100">{fila?.length ?? '…'}</strong>
        </span>
      </div>
      {erro && (
        <div className="px-4 pt-3">
          <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${th} text-center`}>Posição</th>
              <th className={`${th} text-right`}>Nº</th>
              <th className={`${th} text-left w-full`}>Chamado</th>
              <th className={`${th} text-left`}>Categoria</th>
              <th className={`${th} text-left`}>Prioridade</th>
              <th className={`${th} text-center`}>Entrada</th>
              <th className={`${th} text-right`}>Espera</th>
              <th className={`${th} text-center border-r-0`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {!fila ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-stone-500 dark:text-stone-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Carregando chamados…</span>
                  </div>
                </td>
              </tr>
            ) : !fila.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-stone-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <span className="text-sm font-medium text-stone-600 dark:text-stone-300">Fila vazia</span>
                    <span className="text-xs">Nenhum chamado aguardando atendimento agora.</span>
                  </div>
                </td>
              </tr>
            ) : (
              fila.map((c) => (
                <tr key={c.id} className="bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
                  <td className={`${td} text-center`}>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{c.posicao}º</span>
                  </td>
                  <td className={`${td} text-right font-mono text-stone-500`}>{c.numero}</td>
                  <td className={td}>
                    <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                      {c.titulo}
                      {c.status === 'pausado' && <Status s="pausado" />}
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">
                      {c.pessoa_nome || 'Sem cliente'}
                      {c.departamento_nome && ` • ${c.departamento_nome}`}
                    </div>
                  </td>
                  <td className={td}>
                    <Categoria c={c} />
                  </td>
                  <td className={td}>
                    <Prioridade p={c.prioridade} />
                  </td>
                  <td className={`${td} text-center text-stone-500 whitespace-nowrap`}>{formatDateTimeBR(c.criado_em)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <div className="font-semibold text-stone-800 dark:text-stone-100">{tempoEspera(c.espera_min)}</div>
                    {c.sla_vencido && <Sla />}
                  </td>
                  <td className={`${td} text-center border-r-0`}>
                    <button
                      type="button"
                      onClick={() => assumir(c)}
                      disabled={assumindo !== null}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {assumindo === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hand className="w-3.5 h-3.5" />}
                      Assumir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// Chamados Ativos
// ------------------------------------------------------------

const FILTROS: [FiltroChamados, string][] = [
  ['meus', 'Meus'],
  ['todos', 'Todos abertos'],
  ['aguardando', 'Aguardando'],
  ['andamento', 'Em andamento'],
  ['encerrados', 'Encerrados'],
];

interface AtivosProps {
  refreshToken: number;
  /** Botão "Novo Chamado" do cabeçalho */
  createToken: number;
  /** Chamado a abrir (vindo da fila) */
  abrir: number | null;
  onMudou: () => void;
  onConversar: (pessoaId: number) => void;
  onToast: (msg: string) => void;
  /** Chamado encerrado ou pausado pelo técnico: volta para a Fila de Chamados */
  onVoltarFila: () => void;
}

export const ChamadosAtivos: React.FC<AtivosProps> = ({ refreshToken, createToken, abrir, onMudou, onConversar, onToast, onVoltarFila }) => {
  const [filtro, setFiltro] = useState<FiltroChamados>('meus');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<ChamadoResumo[] | null>(null);
  const [aberto, setAberto] = useState<number | null>(abrir);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (abrir) setAberto(abrir);
  }, [abrir]);
  // O botão "Novo Chamado" do cabeçalho (não abre ao montar a tela)
  const inicialCreate = useRef(createToken);
  useEffect(() => {
    if (createToken !== inicialCreate.current) setNovo(true);
  }, [createToken]);

  const carregar = useCallback(() => {
    fetchChamados(filtro, busca.trim())
      .then(setLista)
      .catch((e) => setErro(e.message));
  }, [filtro, busca]);
  useEffect(() => {
    const t = setTimeout(carregar, busca ? 300 : 0);
    const i = setInterval(carregar, 15_000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [carregar, refreshToken]);

  const mudou = () => {
    carregar();
    onMudou();
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* Lista */}
      <div className="w-80 shrink-0 flex flex-col min-h-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <div className="p-3 border-b border-stone-200 dark:border-stone-800 flex flex-col gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Nº, título ou cliente"
              aria-label="Buscar chamado"
              className={`${INPUT_CLASS} w-full pl-8`}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTROS.map(([id, nome]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                  filtro === id ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300'
                }`}
              >
                {nome}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {erro && (
            <div className="p-2">
              <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />
            </div>
          )}
          {!lista ? (
            <Loader2 className="w-5 h-5 m-4 animate-spin text-stone-400" />
          ) : !lista.length ? (
            <p className="p-4 text-xs text-stone-500 dark:text-stone-400">Nenhum chamado neste filtro.</p>
          ) : (
            lista.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setAberto(c.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-stone-100 dark:border-stone-800/70 cursor-pointer ${
                  aberto === c.id ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-stone-400">nº {c.numero}</span>
                  <Status s={c.status} />
                  <span className="ml-auto">
                    <Prioridade p={c.prioridade} />
                  </span>
                </div>
                <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate mt-1">{c.titulo}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {c.pessoa_nome || 'Sem cliente'}
                  {c.atendente_nome ? ` • ${c.atendente_nome}` : ' • sem atendente'}
                </div>
                {c.sla_vencido && <Sla />}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chamado aberto */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-stone-50 dark:bg-stone-950">
        {aberto ? (
          <ChamadoAberto key={aberto} id={aberto} refreshToken={refreshToken} onMudou={mudou} onConversar={onConversar} onToast={onToast} onVoltarFila={onVoltarFila} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-stone-400 gap-2">
            <Inbox className="w-10 h-10" />
            <p className="text-xs">Escolha um chamado na lista, ou abra um novo pelo botão "Novo Chamado".</p>
          </div>
        )}
      </div>

      {novo && (
        <NovoChamado
          onFechar={() => setNovo(false)}
          onCriado={(id, numero) => {
            setNovo(false);
            onToast(`Chamado nº ${numero} aberto.`);
            mudou();
            setAberto(id);
          }}
        />
      )}
    </div>
  );
};

// ------------------------------------------------------------
// Chamado aberto: linha do tempo, resposta, assumir/transferir/encerrar
// ------------------------------------------------------------

const ChamadoAberto: React.FC<{
  id: number;
  refreshToken: number;
  onMudou: () => void;
  onConversar: (pessoaId: number) => void;
  onToast: (msg: string) => void;
  onVoltarFila: () => void;
}> = ({ id, refreshToken, onMudou, onConversar, onToast, onVoltarFila }) => {
  const [c, setC] = useState<ChamadoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [dialogo, setDialogo] = useState<'encerrar' | 'transferir' | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const qtdMsgs = useRef(0);
  /** Campo da resposta: o foco volta para ele depois de enviar (fica desabilitado enquanto envia) */
  const campoResposta = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(() => {
    fetchChamado(id)
      .then(setC)
      .catch((e) => setErro(e.message));
  }, [id]);
  useRecarga(carregar, [carregar, refreshToken]);

  // Mensagem nova: rola para o fim
  useEffect(() => {
    if (c && c.mensagens.length !== qtdMsgs.current) {
      qtdMsgs.current = c.mensagens.length;
      fim.current?.scrollIntoView({ block: 'end' });
    }
  }, [c]);

  if (!c) return erro ? <div className="p-4"><AvisoErro mensagem={erro} onFechar={() => setErro(null)} /></div> : <Loader2 className="w-5 h-5 m-4 animate-spin text-stone-400" />;

  const encerrado = ['encerrado', 'cancelado'].includes(c.status);
  // Número do AnyDesk: o último que o cliente mandou neste chamado, ou o do cadastro da pessoa
  const ultimoId = [...c.mensagens].reverse().find((m) => ID_ANYDESK.test(m.texto));
  const idAnydesk = ultimoId ? ID_ANYDESK.exec(ultimoId.texto)![1] : c.anydesk_id;
  const podeMexer = !encerrado && (!c.atendente_id || c.eu_atendo || c.sou_admin);
  const podeEscrever = !encerrado && (c.eu_atendo || (c.sou_admin && Boolean(c.atendente_id)));
  const botao = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50';
  // Cutucar e Tela Remota: ao lado do "Nota interna", perto de onde se digita
  const botoesSite = podeEscrever && c.canal === 'web' && (
    <>
      <button
        type="button"
        onClick={() => acao(() => cutucarCliente(c.id), 'Cliente cutucado: tocou um som no chat dele.')}
        title="Toca um som e faz o chat do cliente tremer, para chamar a atenção dele"
        className={`${botao} border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40`}
      >
        <Bell className="w-3.5 h-3.5" /> Cutucar
      </button>
      <button
        type="button"
        onClick={() => acao(() => pedirTelaRemota(c.id), 'Pedido de tela remota enviado ao chat do cliente.')}
        title="Mostra no chat do site o botão para o cliente abrir o AnyDesk; ele informa o ID para você conectar"
        className={`${botao} border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40`}
      >
        <MonitorSmartphone className="w-3.5 h-3.5" /> Tela Remota
      </button>
    </>
  );

  const acao = async (fn: () => Promise<any>, ok: string) => {
    setErro(null);
    try {
      await fn();
      onToast(ok);
      carregar();
      onMudou();
    } catch (e: any) {
      setErro(e.message);
    }
  };

  // Conectar: pede a tela remota no chat do site (o AnyDesk do cliente abre) e o link já sobe o AnyDesk do técnico
  const conectar = podeEscrever && c.canal === 'web' ? () => void acao(() => pedirTelaRemota(c.id), 'Tela remota pedida ao cliente; abrindo o seu AnyDesk.') : undefined;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    // Enter de novo enquanto envia: ignora (o campo fica só leitura, não desabilitado, para manter o foco)
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await enviarMensagemChamado(c.id, texto.trim(), interna);
      setTexto('');
      if (r.aviso) onToast(r.aviso);
      carregar();
      onMudou();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
      setTimeout(() => campoResposta.current?.focus(), 0);
    }
  };


  return (
    <>
      {/* Cabeçalho do chamado */}
      <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">Chamado nº {c.numero}</span>
            <Status s={c.status} />
            <Prioridade p={c.prioridade} />
            <Categoria c={c} />
            {c.sla_vencido && <Sla />}
          </div>
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-1">{c.titulo}</h3>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 flex flex-wrap gap-x-3">
            <span>{c.pessoa_nome || 'Sem cliente'}{c.canal === 'web' && ' • pelo site'}</span>
            <span>Atendente: {c.atendente_nome || '—'}{c.eu_atendo && ' (você)'}</span>
            {c.departamento_nome && <span>Departamento: {c.departamento_nome}</span>}
            {c.sla_prazo && <span>SLA até {formatDateTimeBR(c.sla_prazo)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {idAnydesk && <Conectar id={idAnydesk} grande onClick={conectar} />}
          {c.pessoa_id && c.pessoa_telefone && (
            <button type="button" onClick={() => onConversar(c.pessoa_id!)} title="Abre a conversa do WhatsApp deste cliente" className={`${botao} border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800`}>
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> Conversa
            </button>
          )}
          {!c.atendente_id && !encerrado && (
            <button type="button" onClick={() => acao(() => assumirChamado(c.id), `Chamado nº ${c.numero} assumido.`)} className={`${botao} bg-blue-600 hover:bg-blue-700 text-white`}>
              <Hand className="w-3.5 h-3.5" /> Assumir
            </button>
          )}
          {podeEscrever && (
            <button
              type="button"
              onClick={async () => {
                setErro(null);
                try {
                  const r = await pausarChamado(c.id);
                  onToast(r.aviso ? `Chamado nº ${c.numero} pausado. ${r.aviso}` : `Chamado nº ${c.numero} pausado: voltou para a fila.`);
                  onMudou();
                  onVoltarFila();
                } catch (e: any) {
                  setErro(e.message);
                }
              }}
              title="Devolve o chamado para a fila, marcado como pausado: qualquer um pode assumir (o cliente vê que está em pausa)"
              className={`${botao} border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800`}
            >
              <Pause className="w-3.5 h-3.5" /> Pausar
            </button>
          )}
          {podeMexer && (
            <button type="button" onClick={() => setDialogo('transferir')} className={`${botao} border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800`}>
              <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
            </button>
          )}
          {podeMexer && (
            <button type="button" onClick={() => setDialogo('encerrar')} className={`${botao} bg-emerald-600 hover:bg-emerald-700 text-white`}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Encerrar
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="px-5 pt-3">
          <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />
        </div>
      )}

      {/* Linha do tempo */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
        {c.descricao && (
          <div className="self-start max-w-[80%] rounded-xl px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs text-stone-800 dark:text-stone-100 whitespace-pre-wrap">
            <div className="text-[10px] font-semibold text-stone-400 mb-0.5">Descrição{c.aberto_por_nome ? ` • aberto por ${c.aberto_por_nome}` : ''}</div>
            {c.descricao}
          </div>
        )}
        {c.mensagens.map((m) =>
          ID_ANYDESK.test(m.texto) ? (
            <div key={m.id} className="self-start rounded-xl px-3 py-2 bg-white dark:bg-stone-900 border border-rose-200 dark:border-rose-900 text-xs flex flex-wrap items-center gap-2">
              <span className="text-stone-700 dark:text-stone-200">
                Cliente enviou o número do AnyDesk: <strong>{formatarAnydesk(ID_ANYDESK.exec(m.texto)![1])}</strong>
              </span>
              <Conectar id={ID_ANYDESK.exec(m.texto)![1]} onClick={conectar} />
              <span className="text-[10px] text-stone-400">{formatDateTimeBR(m.criado_em)}</span>
            </div>
          ) : m.texto === CUTUCAR ? (
            <div key={m.id} className="self-end text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-full px-3 py-1 inline-flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" /> {m.usuario_nome || 'Equipe'} cutucou o cliente • {formatDateTimeBR(m.criado_em)}
            </div>
          ) : m.texto === TELA_REMOTA ? (
            <div key={m.id} className="self-end text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-full px-3 py-1 inline-flex items-center gap-1.5">
              <MonitorSmartphone className="w-3.5 h-3.5" /> {m.usuario_nome || 'Equipe'} pediu a tela remota (AnyDesk) • {formatDateTimeBR(m.criado_em)}
            </div>
          ) : m.autor === 'sistema' ? (
            <div key={m.id} className="self-center text-[11px] text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-900 rounded-full px-3 py-1">
              {m.texto} • {formatDateTimeBR(m.criado_em)}
            </div>
          ) : (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                m.autor === 'cliente'
                  ? 'self-start bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-100'
                  : m.interna
                    ? 'self-end bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-100'
                    : 'self-end bg-blue-600 text-white'
              }`}
            >
              <div className={`text-[10px] font-semibold mb-0.5 ${m.interna ? 'text-amber-700 dark:text-amber-300' : m.autor === 'cliente' ? 'text-stone-400' : 'text-blue-100'}`}>
                {m.interna && <Lock className="w-3 h-3 inline mr-1 -mt-0.5" />}
                {m.interna ? 'Nota interna • ' : ''}
                {m.usuario_nome || (m.autor === 'cliente' ? c.pessoa_nome || 'Cliente' : 'Equipe')}
              </div>
              {m.texto}
              <div className={`text-[10px] mt-1 text-right ${m.autor === 'equipe' && !m.interna ? 'text-blue-100' : 'text-stone-400'}`}>{formatDateTimeBR(m.criado_em)}</div>
            </div>
          ),
        )}
        <div ref={fim} />
      </div>

      {/* Resposta */}
      {podeEscrever ? (
        <form onSubmit={enviar} className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col gap-2">
          <textarea
            ref={campoResposta}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
            readOnly={enviando}
            rows={2}
            maxLength={4000}
            placeholder={interna ? 'Nota interna: só a equipe vê' : c.canal === 'web' ? 'Resposta ao cliente (aparece no chat do site)' : c.pessoa_telefone ? 'Resposta ao cliente (vai pelo WhatsApp)' : 'Resposta (o cliente não tem WhatsApp: fica só no chamado)'}
            className={`${INPUT_CLASS} w-full resize-y ${interna ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Toggle checked={interna} onChange={setInterna} size="sm" label={<span className="inline-flex items-center gap-1 text-xs"><StickyNote className="w-3.5 h-3.5 text-amber-600" /> Nota interna</span>} />
              {botoesSite}
            </div>
            <button type="submit" disabled={enviando || !texto.trim()} className={`${botao} ${interna ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {enviando ? 'Enviando...' : interna ? 'Gravar nota' : 'Enviar'}
            </button>
          </div>
        </form>
      ) : (
        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          {encerrado
            ? 'Chamado encerrado: só consulta.'
            : !c.atendente_id
              ? 'Assuma o chamado para responder.'
              : `Com ${c.atendente_nome}: só consulta.`}
        </div>
      )}

      {dialogo === 'encerrar' && (
        <ConfirmDialog
          titulo={`Encerrar o chamado nº ${c.numero}?`}
          mensagem="O chamado sai da lista de abertos e não pode mais ser alterado."
          confirmar="Encerrar"
          tom="normal"
          onConfirmar={async () => {
            await encerrarChamado(c.id);
            setDialogo(null);
            onToast(`Chamado nº ${c.numero} encerrado.`);
            onMudou();
            onVoltarFila();
          }}
          onCancelar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'transferir' && (
        <Transferir
          c={c}
          onFechar={() => setDialogo(null)}
          onFeito={(msg) => {
            setDialogo(null);
            onToast(msg);
            carregar();
            onMudou();
          }}
        />
      )}
    </>
  );
};

const Transferir: React.FC<{ c: ChamadoDetalhe; onFechar: () => void; onFeito: (msg: string) => void }> = ({ c, onFechar, onFeito }) => {
  const [usuarios, setUsuarios] = useState<OpcaoRef[]>([]);
  const [departamentos, setDepartamentos] = useState<OpcaoRef[]>([]);
  const [destino, setDestino] = useState('');
  const [obs, setObs] = useState('');
  useEffect(() => {
    fetchOptions('usuarios', 'nome').then(setUsuarios).catch(() => {});
    fetchOptions('departamentos', 'nome').then(setDepartamentos).catch(() => {});
  }, []);
  return (
    <ConfirmDialog
      titulo={`Transferir o chamado nº ${c.numero}`}
      mensagem="Para um usuário: o chamado fica com ele. Para um departamento: volta para a fila, marcado com o departamento."
      confirmar="Transferir"
      tom="normal"
      onConfirmar={async () => {
        const [tipo, idDestino] = destino.split(':');
        if (!idDestino) throw new Error('Escolha para quem transferir.');
        await transferirChamado(c.id, { [tipo === 'u' ? 'usuario_id' : 'departamento_id']: Number(idDestino), observacao: obs });
        onFeito(`Chamado nº ${c.numero} transferido.`);
      }}
      onCancelar={onFechar}
    >
      <div className="flex flex-col gap-3">
        <div className={FIELD_CLASS}>
          <label htmlFor="ch-destino" className={LABEL_CLASS}>Para</label>
          <select id="ch-destino" autoFocus value={destino} onChange={(e) => setDestino(e.target.value)} className={`${INPUT_CLASS} w-full cursor-pointer`}>
            <option value="">Escolha...</option>
            <optgroup label="Usuários">
              {usuarios
                .filter((u) => Number(u.value) !== c.atendente_id)
                .map((u) => (
                  <option key={u.value} value={`u:${u.value}`}>
                    {u.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Departamentos (volta para a fila)">
              {departamentos.map((d) => (
                <option key={d.value} value={`d:${d.value}`}>
                  {d.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="ch-obs" className={LABEL_CLASS}>Observação (opcional)</label>
          <textarea id="ch-obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={500} className={`${INPUT_CLASS} w-full resize-y`} />
        </div>
      </div>
    </ConfirmDialog>
  );
};

// ------------------------------------------------------------
// Novo chamado
// ------------------------------------------------------------

const NovoChamado: React.FC<{ onFechar: () => void; onCriado: (id: number, numero: number) => void }> = ({ onFechar, onCriado }) => {
  const [categorias, setCategorias] = useState<OpcaoRef[]>([]);
  const [pessoa, setPessoa] = useState<{ id: number; nome: string } | null>(null);
  const [buscaPessoa, setBuscaPessoa] = useState('');
  const [achadas, setAchadas] = useState<{ id: number; nome: string; telefone: string | null }[]>([]);
  const [v, setV] = useState({ titulo: '', descricao: '', categoria_id: '', prioridade: 'normal', canal: 'telefone', atender: true });
  const alterar = (m: Partial<typeof v>) => setV({ ...v, ...m });

  useEffect(() => {
    fetchOptions('chamado_categorias', 'nome').then(setCategorias).catch(() => {});
  }, []);
  // Busca do cliente no servidor (são milhares de pessoas)
  useEffect(() => {
    const q = buscaPessoa.trim();
    if (pessoa || q.length < 2) return setAchadas([]);
    const t = setTimeout(() => buscarPessoasChamado(q).then(setAchadas).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [buscaPessoa, pessoa]);

  return (
    <ConfirmDialog
      titulo="Novo chamado"
      mensagem="O prazo de SLA sai da categoria. Com 'Atender agora' ligado, o chamado já fica com você; desligado, vai para a fila."
      confirmar="Abrir chamado"
      tom="normal"
      onConfirmar={async () => {
        if (!v.titulo.trim()) throw new Error('Informe o título do chamado.');
        const r = await criarChamado({ ...v, pessoa_id: pessoa?.id ?? null, categoria_id: Number(v.categoria_id) || null });
        onCriado(r.id, r.numero);
      }}
      onCancelar={onFechar}
    >
      <div className="flex flex-col gap-3">
        <div className={FIELD_CLASS}>
          <label htmlFor="ch-cliente" className={LABEL_CLASS}>Cliente</label>
          {pessoa ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs font-semibold text-stone-800 dark:text-stone-100 truncate">{pessoa.nome}</span>
              <button type="button" onClick={() => { setPessoa(null); setBuscaPessoa(''); }} className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer">
                Trocar
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                id="ch-cliente"
                autoFocus
                value={buscaPessoa}
                onChange={(e) => setBuscaPessoa(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="Nome, CPF/CNPJ ou telefone"
                autoComplete="off"
                className={`${INPUT_CLASS} w-full`}
              />
              {achadas.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg">
                  {achadas.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setPessoa(p)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
                        <span className="font-semibold text-stone-800 dark:text-stone-100">{p.nome}</span>
                        {p.telefone && <span className="text-stone-400"> • {p.telefone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <span className={HINT_CLASS}>Opcional. Com cliente que tem WhatsApp, as respostas vão para ele.</span>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="ch-titulo" className={LABEL_CLASS}>Título<span className="text-rose-500 ml-1">*</span></label>
          <input id="ch-titulo" required value={v.titulo} onChange={(e) => alterar({ titulo: e.target.value })} onFocus={(e) => e.target.select()} maxLength={200} className={`${INPUT_CLASS} w-full`} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className={FIELD_CLASS}>
            <label htmlFor="ch-cat" className={LABEL_CLASS}>Categoria</label>
            <select id="ch-cat" value={v.categoria_id} onChange={(e) => alterar({ categoria_id: e.target.value })} className={`${INPUT_CLASS} w-full cursor-pointer`}>
              <option value="">—</option>
              {categorias.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="ch-prio" className={LABEL_CLASS}>Prioridade</label>
            <select id="ch-prio" value={v.prioridade} onChange={(e) => alterar({ prioridade: e.target.value })} className={`${INPUT_CLASS} w-full cursor-pointer`}>
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="ch-canal" className={LABEL_CLASS}>Canal</label>
            <select id="ch-canal" value={v.canal} onChange={(e) => alterar({ canal: e.target.value })} className={`${INPUT_CLASS} w-full cursor-pointer`}>
              <option value="telefone">Telefone</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
              <option value="interno">Interno</option>
            </select>
          </div>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="ch-desc" className={LABEL_CLASS}>Descrição</label>
          <textarea id="ch-desc" value={v.descricao} onChange={(e) => alterar({ descricao: e.target.value })} rows={3} maxLength={4000} className={`${INPUT_CLASS} w-full resize-y`} />
        </div>
        <Toggle checked={v.atender} onChange={(atender) => alterar({ atender })} size="sm" label="Atender agora (o chamado fica comigo)" />
      </div>
    </ConfirmDialog>
  );
};
