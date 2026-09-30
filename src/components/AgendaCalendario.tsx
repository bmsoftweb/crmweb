import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus } from 'lucide-react';
import { FiltroAvancado, RegistroCrud, ResourceDef } from '../types';
import { listRecords } from '../services/api';
import { AvisoErro } from './AvisoErro';

export type VisaoCalendario = 'semana' | 'mes';

interface Props {
  resource: ResourceDef;
  visao: VisaoCalendario;
  /** Mesmos filtros da lista (busca avançada, filtro rápido, "Só as minhas", busca) */
  filtros: FiltroAvancado[];
  search: string;
  minhas: boolean;
  /** Muda quando a lista recarrega (registro gravado, concluído...): o calendário relê também */
  gatilho: unknown;
  selecionadoId: string | null;
  onSelecionar: (row: RegistroCrud) => void;
  onAbrir: (row: RegistroCrud) => void;
  /** Inclusão já com o dia (AAAA-MM-DD) e, na semana, a hora clicada (HH:MM); sem ela (sem permissão de incluir), o menu não oferece "Novo" */
  onNovo?: (data: string, hora: string | null) => void;
  onVisao: (v: VisaoCalendario) => void;
}

/** Menu do botão direito: onde abriu, o dia, a hora (grade da semana) e a atividade sob o mouse (null = espaço vazio) */
interface MenuDia {
  x: number;
  y: number;
  dia: string;
  hora: string | null;
  row: RegistroCrud | null;
}
/** Na grade da semana, o clique vale pela meia hora em que caiu */
const PASSO_MINUTOS = 30;
const ALTURA_MENU = 100;

const ALTURA_HORA = 44;
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Datas locais (horário de Brasília do navegador), sempre como texto AAAA-MM-DD
const doisDigitos = (n: number) => String(n).padStart(2, '0');
const chave = (d: Date) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const domingoDe = (d: Date) => somarDias(d, -d.getDay());
const minutos = (t: unknown) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Período visível: a semana (domingo a sábado) ou as semanas inteiras que cobrem o mês */
function periodo(visao: VisaoCalendario, ref: Date): { inicio: Date; dias: number } {
  if (visao === 'semana') return { inicio: domingoDe(ref), dias: 7 };
  const primeiro = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const inicio = domingoDe(primeiro);
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { inicio, dias: Math.ceil((ultimo.getDate() + primeiro.getDay()) / 7) * 7 };
}

/** Menor altura da caixa na semana (uma linha de texto), em minutos: vale também para decidir quem se sobrepõe */
const MINUTOS_MINIMOS = 25;

/** Atividades com hora que se sobrepõem dividem a largura do dia, como no Google Agenda */
export function distribuir(itens: RegistroCrud[]) {
  const eventos = itens
    .map((r) => {
      const ini = minutos(r.hora_vencimento);
      return { r, ini, fim: Math.min(ini + Math.max(minutos(r.duracao), MINUTOS_MINIMOS), 24 * 60), col: 0, cols: 1 };
    })
    .sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  let grupo: typeof eventos = [];
  let fimGrupo = -1;
  const fechar = () => {
    const cols = Math.max(0, ...grupo.map((e) => e.col)) + 1;
    grupo.forEach((e) => (e.cols = cols));
  };
  for (const e of eventos) {
    if (e.ini >= fimGrupo && grupo.length) {
      fechar();
      grupo = [];
    }
    const ocupadas = new Set(grupo.filter((g) => g.fim > e.ini).map((g) => g.col));
    while (ocupadas.has(e.col)) e.col++;
    grupo.push(e);
    fimGrupo = Math.max(fimGrupo, e.fim);
  }
  if (grupo.length) fechar();
  return eventos;
}

/**
 * Visões Semana e Mês das atividades (Atividades/Tarefas), no estilo do Google Agenda: domingo primeiro,
 * clique seleciona (a ficha abre embaixo), duplo clique abre para edição.
 */
export const AgendaCalendario: React.FC<Props> = ({ resource, visao, filtros, search, minhas, gatilho, selecionadoId, onSelecionar, onAbrir, onNovo, onVisao }) => {
  const [menu, setMenu] = useState<MenuDia | null>(null);

  // Fecha ao clicar fora, rolar ou Esc (como o menu "..." das listas)
  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('mousedown', fechar);
    document.addEventListener('scroll', fechar, true);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('scroll', fechar, true);
      document.removeEventListener('keydown', tecla);
    };
  }, [menu]);

  const abrirMenu = (e: React.MouseEvent, dia: string, row: RegistroCrud | null, hora: string | null = null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, dia, hora, row });
  };

  /** Hora do ponto clicado na coluna do dia (a coluna tem as 24 h de altura) */
  const horaDoClique = (e: React.MouseEvent<HTMLElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.floor((y / ALTURA_HORA) * 60 / PASSO_MINUTOS) * PASSO_MINUTOS;
    const m = Math.min(Math.max(min, 0), 24 * 60 - PASSO_MINUTOS);
    return `${doisDigitos(Math.floor(m / 60))}:${doisDigitos(m % 60)}`;
  };
  const [ref, setRef] = useState(() => new Date());
  const [itens, setItens] = useState<RegistroCrud[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const rolagem = useRef<HTMLDivElement>(null);

  const { inicio, dias } = periodo(visao, ref);
  const de = chave(inicio);
  const ate = chave(somarDias(inicio, dias - 1));
  const hoje = chave(agora);
  const pk = resource.pk[0];

  // Todas as atividades do período, página a página (o servidor devolve até 200 por vez)
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      const faixa: FiltroAvancado[] = [...filtros, { field: 'data_vencimento', op: 'gte', value: de }, { field: 'data_vencimento', op: 'lte', value: ate }];
      const todos: RegistroCrud[] = [];
      for (let page = 1; ; page++) {
        const d = await listRecords(resource.name, { page, limit: 200, search, minhas, filters: faixa, sort: 'data_vencimento', dir: 'asc' });
        todos.push(...d.data);
        if (page >= d.totalPages) break;
      }
      if (vivo) setItens(todos);
    })()
      .catch((e) => vivo && setErro(e.message || 'Falha ao carregar as atividades.'))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [resource.name, de, ate, filtros, search, minhas, gatilho]);

  // Linha da hora atual
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Semana abre rolada no começo do expediente
  useLayoutEffect(() => {
    if (visao === 'semana' && rolagem.current) rolagem.current.scrollTop = 7 * ALTURA_HORA;
  }, [visao]);

  const porDia = useMemo(() => {
    const m: Record<string, RegistroCrud[]> = {};
    for (const r of itens) (m[String(r.data_vencimento).slice(0, 10)] ||= []).push(r);
    for (const k in m) m[k].sort((a, b) => (a.hora_vencimento ? minutos(a.hora_vencimento) : -1) - (b.hora_vencimento ? minutos(b.hora_vencimento) : -1));
    return m;
  }, [itens]);

  const navegar = (n: number) =>
    setRef((r) => (visao === 'semana' ? somarDias(r, 7 * n) : new Date(r.getFullYear(), r.getMonth() + n, 1)));

  const titulo =
    visao === 'mes'
      ? ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : (() => {
          const fim = somarDias(inicio, 6);
          const mesmoMes = inicio.getMonth() === fim.getMonth();
          const a = inicio.toLocaleDateString('pt-BR', mesmoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
          return `${a} – ${fim.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        })();

  const cor = (r: RegistroCrud) =>
    Number(r.concluida)
      ? 'bg-stone-100 text-stone-500 border-stone-300 line-through dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700'
      : String(r.data_vencimento).slice(0, 10) < hoje
      ? 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800'
      : r.origem === 'google'
      ? 'bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800'
      : 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800';

  const item = (r: RegistroCrud, extra = '', estilo?: React.CSSProperties) => (
    <button
      key={String(r[pk])}
      type="button"
      style={estilo}
      onContextMenu={(e) => abrirMenu(e, String(r.data_vencimento).slice(0, 10), r)}
      onClick={(e) => {
        e.stopPropagation();
        onSelecionar(r);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onAbrir(r);
      }}
      title={`${r.hora_vencimento ? `${String(r.hora_vencimento).slice(0, 5)} ` : ''}${r.assunto ?? ''}${r.quem_executa ? ` • ${r.quem_executa}` : ''}`}
      className={`text-left text-[11px] leading-tight rounded border px-1.5 py-0.5 truncate cursor-pointer ${cor(r)} ${
        selecionadoId === String(r[pk]) ? 'ring-2 ring-blue-500 dark:ring-blue-400 z-10' : ''
      } ${extra}`}
    >
      {r.hora_vencimento && <span className="font-semibold mr-1">{String(r.hora_vencimento).slice(0, 5)}</span>}
      {String(r.assunto ?? '')}
    </button>
  );

  const semana = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Navegação do período */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-stone-200 dark:border-stone-800 shrink-0">
        <button
          type="button"
          onClick={() => setRef(new Date())}
          className="px-3 py-1 rounded-lg border border-stone-300 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
        >
          Hoje
        </button>
        <button type="button" onClick={() => navegar(-1)} title={visao === 'semana' ? 'Semana anterior' : 'Mês anterior'} className="p-1 rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => navegar(1)} title={visao === 'semana' ? 'Próxima semana' : 'Próximo mês'} className="p-1 rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
          <ChevronRight className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100 first-letter:uppercase">{titulo}</h3>
        {carregando && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />}
        <span className="ml-auto text-[11px] text-stone-500 dark:text-stone-400 hidden sm:inline">
          Clique para ver os detalhes · duplo clique para editar
        </span>
      </div>

      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} className="mx-4 mt-3 shrink-0" />}

      {visao === 'semana' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Cabeçalho dos dias + faixa do dia inteiro (atividades sem hora) */}
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-stone-200 dark:border-stone-800 shrink-0 overflow-y-hidden [scrollbar-gutter:stable]">
            <div />
            {semana.map((d) => {
              const k = chave(d);
              return (
                <div
                  key={k}
                  onContextMenu={(e) => abrirMenu(e, k, null)}
                  className={`px-1 pt-1.5 pb-1 text-center border-l border-stone-200 dark:border-stone-800 min-w-0 ${
                    menu?.dia === k && !menu.hora ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <div className={`text-[10px] font-semibold uppercase ${k === hoje ? 'text-blue-600 dark:text-blue-400' : 'text-stone-500 dark:text-stone-400'}`}>{DIAS[d.getDay()]}</div>
                  <div
                    className={`mx-auto w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold ${
                      k === hoje ? 'bg-blue-600 text-white' : 'text-stone-800 dark:text-stone-100'
                    }`}
                  >
                    {d.getDate()}
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5 min-h-[4px]">{(porDia[k] || []).filter((r) => !r.hora_vencimento).map((r) => item(r))}</div>
                </div>
              );
            })}
          </div>

          {/* Grade de horas */}
          <div ref={rolagem} className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] relative" style={{ height: 24 * ALTURA_HORA }}>
              <div className="relative">
                {Array.from({ length: 23 }, (_, h) => (
                  <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-stone-400" style={{ top: (h + 1) * ALTURA_HORA }}>
                    {doisDigitos(h + 1)}:00
                  </span>
                ))}
              </div>
              {semana.map((d) => {
                const k = chave(d);
                return (
                  <div key={k} onContextMenu={(e) => abrirMenu(e, k, null, horaDoClique(e))} className="relative border-l border-stone-200 dark:border-stone-800">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="border-b border-stone-100 dark:border-stone-800/60" style={{ height: ALTURA_HORA }} />
                    ))}
                    {/* Meia hora do botão direito, enquanto o menu está aberto */}
                    {menu?.dia === k && menu.hora && (
                      <div
                        className="absolute left-0 right-0 bg-blue-100/80 dark:bg-blue-900/40 pointer-events-none"
                        style={{ top: (minutos(menu.hora) / 60) * ALTURA_HORA, height: (PASSO_MINUTOS / 60) * ALTURA_HORA }}
                      />
                    )}
                    {distribuir((porDia[k] || []).filter((r) => r.hora_vencimento)).map((e) =>
                      // Caixa curta: hora e assunto numa linha; alta: o assunto quebra linhas
                      item(e.r, `absolute ${e.fim - e.ini >= 45 ? '!whitespace-normal' : ''}`, {
                        top: (e.ini / 60) * ALTURA_HORA,
                        height: ((e.fim - e.ini) / 60) * ALTURA_HORA - 2,
                        left: `calc(${(e.col / e.cols) * 100}% + 2px)`,
                        width: `calc(${100 / e.cols}% - 4px)`,
                      }),
                    )}
                    {k === hoje && (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: ((agora.getHours() * 60 + agora.getMinutes()) / 60) * ALTURA_HORA }}>
                        <div className="h-0.5 bg-rose-500" />
                        <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-rose-500" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid grid-cols-7 border-b border-stone-200 dark:border-stone-800 shrink-0">
            {DIAS.map((d) => (
              <div key={d} className="py-1.5 text-center text-[10px] font-semibold uppercase text-stone-500 dark:text-stone-400">
                {d}
              </div>
            ))}
          </div>
          <div className="flex-1 grid grid-cols-7 auto-rows-fr min-h-0 overflow-y-auto">
            {Array.from({ length: dias }, (_, i) => {
              const d = somarDias(inicio, i);
              const k = chave(d);
              const lista = porDia[k] || [];
              const cabem = 3;
              const foraDoMes = d.getMonth() !== ref.getMonth();
              return (
                <div
                  key={k}
                  onContextMenu={(e) => abrirMenu(e, k, null)}
                  className={`min-h-[96px] p-1 border-b border-r border-stone-200 dark:border-stone-800 flex flex-col gap-0.5 min-w-0 ${
                    menu?.dia === k ? 'bg-blue-50/70 dark:bg-blue-950/30' : foraDoMes ? 'bg-stone-50/70 dark:bg-stone-950/40' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setRef(d);
                      onVisao('semana');
                    }}
                    title="Ver a semana"
                    className={`self-center w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold cursor-pointer ${
                      k === hoje ? 'bg-blue-600 text-white' : foraDoMes ? 'text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800' : 'text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    {d.getDate()}
                  </button>
                  {lista.slice(0, lista.length > cabem + 1 ? cabem : cabem + 1).map((r) => item(r))}
                  {lista.length > cabem + 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRef(d);
                        onVisao('semana');
                      }}
                      className="text-left px-1.5 text-[11px] font-semibold text-stone-500 dark:text-stone-400 hover:text-blue-600 cursor-pointer"
                    >
                      +{lista.length - cabem} mais
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {menu &&
        createPortal(
          <div
            role="menu"
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            // Perto do pé ou da borda direita da tela, abre para cima / para a esquerda
            style={{
              ...(menu.y + ALTURA_MENU > window.innerHeight ? { bottom: window.innerHeight - menu.y } : { top: menu.y }),
              ...(menu.x + 200 > window.innerWidth ? { right: window.innerWidth - menu.x } : { left: menu.x }),
            }}
            className="fixed z-[60] min-w-48 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl"
          >
            {onNovo && (
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenu(null);
                  onNovo(menu.dia, menu.hora);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium whitespace-nowrap text-stone-800 dark:text-stone-100">Novo</span>
              </button>
            )}
            {onNovo && <div className="my-1 border-t border-stone-100 dark:border-stone-800" />}
            <button
              role="menuitem"
              type="button"
              disabled={!menu.row}
              title={menu.row ? String(menu.row.assunto ?? '') : 'Clique com o botão direito em cima de uma atividade para editá-la'}
              onClick={() => {
                const row = menu.row;
                setMenu(null);
                if (row) onAbrir(row);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <Pencil className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium whitespace-nowrap text-stone-800 dark:text-stone-100">Editar</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};
