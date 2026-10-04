import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock,
  Hourglass,
  Inbox,
  Loader2,
  MessageCircle,
  PauseCircle,
  Star,
  Ticket,
  UserRoundCheck,
} from 'lucide-react';
import { painelSuporte, PainelSuporteDados, Contagem } from '../services/api';
import { FiltroAvancado } from '../types';

/**
 * Painel de Suporte: indicadores do período comparados com o anterior equivalente, a situação de agora e os
 * gráficos de volume, distribuição, satisfação e desempenho. Gráficos em HTML/CSS (sem biblioteca), com as cores
 * da classe .viz (index.css): no máximo duas séries por gráfico.
 */

const CARD = 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl';
const TITULO = 'text-sm font-bold text-stone-900 dark:text-stone-100';

const PERIODOS = [
  ['7d', '7 dias'],
  ['30d', '30 dias'],
  ['mes', 'Este mês'],
  ['mes_anterior', 'Mês passado'],
  ['90d', '90 dias'],
  ['ano', 'Este ano'],
] as const;

const CANAIS: Record<string, string> = { interno: 'Interno', whatsapp: 'WhatsApp', telefone: 'Telefone', email: 'E-mail', web: 'Site' };
const PRIORIDADES: Record<string, string> = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
const MOTIVOS: Record<string, string> = {
  botao: 'Encerrado pelo atendente',
  tempo: 'Tempo esgotado',
  inatividade: 'Cliente inativo',
  automacao: 'Pela automação',
  outro: 'Outro',
};
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Título dos gráficos no tempo ("Chamados por semana"): a série agrupa por dia, semana ou mês conforme o período */
const UNIDADE: Record<string, string> = { dia: 'dia', semana: 'semana (início no domingo)', mes: 'mês' };

const dataBr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const inteiro = (n: number) => n.toLocaleString('pt-BR');
const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(0)}%`);
const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','));
/** Minutos em texto curto: 35 min, 3 h 20 min, 2 d 4 h */
export function duracao(min: number | null): string {
  if (min == null) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return `${d} d${h ? ` ${h} h` : ''}`;
}

// ---------------------------------------------------------------- Indicador com comparação

/**
 * Variação contra o período anterior. `pontos` = diferença em pontos (percentuais, notas); senão, % de variação.
 * Melhorou = verde com seta, piorou = vermelho; a cor nunca vem sozinha (seta + texto).
 */
const Variacao: React.FC<{ atual: number | null; anterior: number | null; melhorSeMaior: boolean; pontos?: 'pp' | 'nota' }> = ({
  atual,
  anterior,
  melhorSeMaior,
  pontos,
}) => {
  if (atual == null || anterior == null || (!pontos && anterior === 0)) {
    return <span className="text-[11px] text-stone-400">sem base de comparação</span>;
  }
  const dif = pontos ? atual - anterior : ((atual - anterior) / anterior) * 100;
  if (Math.abs(dif) < (pontos === 'nota' ? 0.05 : 0.5)) return <span className="text-[11px] text-stone-500 dark:text-stone-400">igual ao anterior</span>;
  const subiu = dif > 0;
  const melhorou = subiu === melhorSeMaior;
  const Seta = subiu ? ArrowUpRight : ArrowDownRight;
  const texto = pontos === 'nota' ? dif.toFixed(1).replace('.', ',') : pontos === 'pp' ? `${Math.abs(dif).toFixed(0)} p.p.` : `${Math.abs(dif).toFixed(0)}%`;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: melhorou ? 'var(--status-bom)' : 'var(--status-ruim)' }}>
      <Seta className="w-3.5 h-3.5" />
      {pontos === 'nota' && subiu ? '+' : ''}
      {texto} {melhorou ? 'melhor' : 'pior'}
    </span>
  );
};

const Indicador: React.FC<{ titulo: string; valor: string; icone: React.ElementType; detalhe?: string; children?: React.ReactNode }> = ({
  titulo,
  valor,
  icone: Icone,
  detalhe,
  children,
}) => (
  <div className={`${CARD} p-4`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{titulo}</span>
      <Icone className="w-4 h-4 text-stone-400" />
    </div>
    <div className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">{valor}</div>
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
      {children}
      {detalhe && <span className="text-[11px] text-stone-500 dark:text-stone-400">{detalhe}</span>}
    </div>
  </div>
);

// ---------------------------------------------------------------- Dica do mouse

interface Dica {
  x: number;
  y: number;
  linhas: string[];
}
const DicaFlutuante: React.FC<{ dica: Dica | null }> = ({ dica }) =>
  dica ? (
    <div
      className="fixed z-[60] pointer-events-none px-2.5 py-1.5 rounded-lg bg-stone-900 text-white text-[11px] shadow-lg dark:bg-stone-100 dark:text-stone-900"
      style={{ left: dica.x + 12, top: dica.y + 12 }}
    >
      {dica.linhas.map((l, i) => (
        <div key={i} className={i === 0 ? 'font-semibold' : ''}>
          {l}
        </div>
      ))}
    </div>
  ) : null;

// ---------------------------------------------------------------- Gráficos

/** Colunas por dia/semana/mês: uma ou duas séries lado a lado, eixo único a partir do zero */
const Colunas: React.FC<{
  pontos: { k: string; valores: number[] }[];
  series: { nome: string; cor: string }[];
  rotulo: (k: string) => string;
  /** Título da dica do mouse (ex.: "Semana de 06/09"); sem ele, o rótulo do eixo */
  rotuloDica?: (k: string) => string;
  onDica: (d: Dica | null) => void;
}> = ({ pontos, series, rotulo, rotuloDica = rotulo, onDica }) => {
  const maximo = Math.max(1, ...pontos.flatMap((p) => p.valores));
  // Marcas do eixo: 0, metade e o máximo arredondado para cima
  const topo = Math.ceil(maximo / 2) * 2;
  return (
    <div>
      {series.length > 1 && (
        <div className="flex gap-4 mb-2">
          {series.map((s) => (
            <span key={s.nome} className="inline-flex items-center gap-1.5 text-[11px] text-stone-600 dark:text-stone-300">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.cor }} />
              {s.nome}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-stone-400 tabular-nums h-40 text-right w-6 shrink-0">
          <span>{topo}</span>
          <span>{topo / 2}</span>
          <span>0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-40 border-b" style={{ borderColor: 'var(--grade)' }}>
            {[0, 0.5].map((f) => (
              <div key={f} className="absolute left-0 right-0 border-t" style={{ top: `${f * 100}%`, borderColor: 'var(--grade)' }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-px overflow-hidden">
              {pontos.map((p) => (
                <div
                  key={p.k}
                  className="flex-1 min-w-0 h-full flex items-end justify-center gap-[2px] hover:bg-stone-100/70 dark:hover:bg-stone-800/50 rounded-t cursor-default"
                  onMouseMove={(e) => onDica({ x: e.clientX, y: e.clientY, linhas: [rotuloDica(p.k), ...series.map((s, i) => `${s.nome}: ${p.valores[i]}`)] })}
                  onMouseLeave={() => onDica(null)}
                >
                  {p.valores.map((v, i) => (
                    <div
                      key={i}
                      className="rounded-t"
                      style={{ height: `${(v / topo) * 100}%`, width: `${Math.min(14, 70 / series.length)}%`, minWidth: 1, background: series[i].cor }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          {/* Todos os rótulos, a 45°: o fim do texto fica embaixo do centro da coluna e ele desce para a esquerda */}
          <div className="flex gap-px h-9">
            {pontos.map((p) => (
              <div key={p.k} className="flex-1 min-w-0 relative">
                <span
                  className="absolute top-1 text-[10px] leading-none text-stone-400 tabular-nums whitespace-nowrap"
                  style={{ right: '50%', transform: 'rotate(-45deg)', transformOrigin: 'right top' }}
                >
                  {rotulo(p.k)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Barras horizontais de uma série: nome, barra, quantidade e % do total */
const Barras: React.FC<{ itens: Contagem[]; nome?: (n: string) => string; extra?: (c: Contagem) => string | null; vazio: string }> = ({
  itens,
  nome = (n) => n,
  extra,
  vazio,
}) => {
  if (!itens.length) return <p className="text-xs text-stone-400 py-6 text-center">{vazio}</p>;
  const total = itens.reduce((s, i) => s + i.qtd, 0);
  const maior = Math.max(...itens.map((i) => i.qtd));
  return (
    <ul className="space-y-2">
      {itens.map((i) => (
        <li key={i.nome} className="text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-stone-700 dark:text-stone-200 truncate">{nome(i.nome)}</span>
            <span className="tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
              <b className="text-stone-800 dark:text-stone-100">{inteiro(i.qtd)}</b> · {((i.qtd / total) * 100).toFixed(0)}%
              {extra?.(i) ? ` · ${extra(i)}` : ''}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-stone-100 dark:bg-stone-800">
            <div className="h-2 rounded-full" style={{ width: `${(i.qtd / maior) * 100}%`, background: 'var(--serie-1)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

/** Mapa de calor dia da semana × hora: intensidade de uma cor só (mais escuro = mais atendimentos) */
const MapaCalor: React.FC<{ celulas: PainelSuporteDados['mapa']; onDica: (d: Dica | null) => void }> = ({ celulas, onDica }) => {
  const maior = Math.max(1, ...celulas.map((c) => c.n));
  const valor = (dia: number, hora: number) => celulas.find((c) => c.dia === dia && c.hora === hora)?.n ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="text-[9px] font-normal text-stone-400 tabular-nums w-6">
                {h % 3 === 0 ? `${h}h` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIAS.map((d, i) => (
            <tr key={d}>
              <th className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 pr-1 text-right">{d}</th>
              {Array.from({ length: 24 }, (_, h) => {
                const n = valor(i + 1, h);
                return (
                  <td
                    key={h}
                    className="w-6 h-5 rounded-[3px]"
                    style={{
                      background: n ? `color-mix(in srgb, var(--serie-1) ${20 + (n / maior) * 80}%, transparent)` : 'var(--grade)',
                      opacity: n ? 1 : 0.5,
                    }}
                    onMouseMove={(e) => onDica({ x: e.clientX, y: e.clientY, linhas: [`${d}, ${h}h–${h + 1}h`, `${n} atendimento(s)`] })}
                    onMouseLeave={() => onDica(null)}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-stone-400">
        menos
        {[20, 47, 73, 100].map((p) => (
          <span key={p} className="w-4 h-3 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--serie-1) ${p}%, transparent)` }} />
        ))}
        mais
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Tela

interface Props {
  refreshToken: number;
  onNavigate: (tab: string) => void;
  /** Abre um cadastro já com busca avançada (ex.: Consulta de Chamados do técnico) */
  onNavigateFiltrado: (tab: string, filtros: FiltroAvancado[]) => void;
}

export const PainelSuporte: React.FC<Props> = ({ refreshToken, onNavigate, onNavigateFiltrado }) => {
  const [periodo, setPeriodo] = useState<string>(() => {
    try {
      return localStorage.getItem('crmweb.painelSuporte.periodo') || '30d';
    } catch {
      return '30d';
    }
  });
  const [dados, setDados] = useState<PainelSuporteDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dica, setDica] = useState<Dica | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    painelSuporte(periodo)
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [periodo, refreshToken]);

  const escolher = (p: string) => {
    setPeriodo(p);
    try {
      localStorage.setItem('crmweb.painelSuporte.periodo', p);
    } catch {
      // sem armazenamento: vale até recarregar
    }
  };

  const filtro = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex flex-wrap gap-0.5 p-0.5 rounded-lg bg-stone-200/70 dark:bg-stone-800">
        {PERIODOS.map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            onClick={() => escolher(v)}
            className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
              periodo === v ? 'bg-white dark:bg-stone-700 text-blue-700 dark:text-blue-300 shadow-xs' : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {dados && (
        <span className="text-[11px] text-stone-500 dark:text-stone-400">
          {dataBr(dados.periodo.atual.de)} a {dataBr(dados.periodo.atual.ate)}, comparado com {dataBr(dados.periodo.anterior.de)} a {dataBr(dados.periodo.anterior.ate)}
        </span>
      )}
      {carregando && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
    </div>
  );

  if (erro) {
    return (
      <div className="space-y-4">
        {filtro}
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {erro}
        </div>
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="py-24 flex items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando indicadores…
      </div>
    );
  }

  const { atual: a, anterior: b, agora } = dados;
  // Semana: o rótulo é o domingo que a abre (a dica diz "Semana de 06/09")
  const rotuloSerie = (k: string) => (dados.serie.unidade === 'mes' ? `${k.slice(5, 7)}/${k.slice(2, 4)}` : `${k.slice(8, 10)}/${k.slice(5, 7)}`);
  const totalNotas = dados.notas.reduce((s, n) => s + n.qtd, 0);

  return (
    <div className={`viz space-y-5 ${carregando ? 'opacity-70' : ''}`}>
      {filtro}

      {/* Indicadores do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador titulo="Chamados abertos" valor={inteiro(a.chamados.abertos)} icone={Ticket}>
          <Variacao atual={a.chamados.abertos} anterior={b.chamados.abertos} melhorSeMaior={false} />
        </Indicador>
        <Indicador titulo="Chamados encerrados" valor={inteiro(a.chamados.encerrados)} icone={CheckCircle2}>
          <Variacao atual={a.chamados.encerrados} anterior={b.chamados.encerrados} melhorSeMaior />
        </Indicador>
        <Indicador titulo="Tempo até assumir" valor={duracao(a.chamados.min_assumir)} icone={Hourglass} detalhe="média">
          <Variacao atual={a.chamados.min_assumir} anterior={b.chamados.min_assumir} melhorSeMaior={false} />
        </Indicador>
        <Indicador titulo="Tempo de resolução" valor={duracao(a.chamados.min_resolver)} icone={Clock} detalhe="média, abertura ao encerramento">
          <Variacao atual={a.chamados.min_resolver} anterior={b.chamados.min_resolver} melhorSeMaior={false} />
        </Indicador>
        <Indicador titulo="Chamados hoje" valor={inteiro(agora.hoje)} icone={CalendarDays} detalhe="abertos hoje, comparado a ontem">
          <Variacao atual={agora.hoje} anterior={agora.ontem} melhorSeMaior={false} />
        </Indicador>
        <Indicador titulo="Atendimentos WhatsApp" valor={inteiro(a.whatsapp.total)} icone={MessageCircle} detalhe={`duração média ${duracao(a.whatsapp.min_duracao)}`}>
          <Variacao atual={a.whatsapp.total} anterior={b.whatsapp.total} melhorSeMaior />
        </Indicador>
        <Indicador titulo="Resolvidos só pelo bot" valor={pct(a.whatsapp.so_bot_pct)} icone={Bot} detalhe="dos atendimentos do WhatsApp">
          <Variacao atual={a.whatsapp.so_bot_pct} anterior={b.whatsapp.so_bot_pct} melhorSeMaior pontos="pp" />
        </Indicador>
        <Indicador
          titulo="Satisfação"
          valor={a.satisfacao.media == null ? '—' : `${nota(a.satisfacao.media)} ★`}
          icone={Star}
          detalhe={`${a.satisfacao.respondidas} avaliação(ões) · ${pct(a.satisfacao.resposta_pct)} responderam`}
        >
          <Variacao atual={a.satisfacao.media} anterior={b.satisfacao.media} melhorSeMaior pontos="nota" />
        </Indicador>
      </div>

      {/* Agora */}
      <section className={`${CARD} p-4`}>
        <h3 className={`${TITULO} mb-3`}>Agora</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(
            [
              ['Em aberto', agora.em_aberto, Ticket, 'chamados_ativos', false],
              ['Na fila', agora.na_fila, Inbox, 'chamados_fila', false],
              ['SLA estourado', agora.sla_estourado, AlertTriangle, 'chamados_ativos', true],
              ['Aguardando cliente', agora.pendente_cliente, UserRoundCheck, 'chamados_ativos', false],
              ['Pausados', agora.pausados, PauseCircle, 'chamados_ativos', false],
            ] as const
          ).map(([rotulo, n, Icone, destino, alerta]) => (
            <button
              key={rotulo}
              type="button"
              onClick={() => onNavigate(destino)}
              className="text-left p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-blue-300 dark:hover:border-blue-800 cursor-pointer"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                <Icone className="w-3.5 h-3.5" style={alerta && n ? { color: 'var(--status-ruim)' } : undefined} />
                {rotulo}
              </div>
              <div className="mt-1 text-xl font-bold text-stone-900 dark:text-stone-100">{inteiro(n)}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Volume no tempo */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className={`${CARD} p-5`}>
          <h3 className={`${TITULO} mb-3`}>Chamados por {UNIDADE[dados.serie.unidade]}</h3>
          <Colunas
            pontos={dados.serie.pontos.map((p) => ({ k: p.k, valores: [p.abertos, p.encerrados] }))}
            series={[
              { nome: 'Abertos', cor: 'var(--serie-1)' },
              { nome: 'Encerrados', cor: 'var(--serie-2)' },
            ]}
            rotulo={rotuloSerie}
            rotuloDica={(k) => (dados.serie.unidade === 'semana' ? `Semana de ${rotuloSerie(k)}` : rotuloSerie(k))}
            onDica={setDica}
          />
        </section>
        <section className={`${CARD} p-5`}>
          <h3 className={`${TITULO} mb-3`}>Atendimentos do WhatsApp por {UNIDADE[dados.serie.unidade]}</h3>
          <Colunas
            pontos={dados.serie.pontos.map((p) => ({ k: p.k, valores: [p.whatsapp] }))}
            series={[{ nome: 'Atendimentos', cor: 'var(--serie-1)' }]}
            rotulo={rotuloSerie}
            rotuloDica={(k) => (dados.serie.unidade === 'semana' ? `Semana de ${rotuloSerie(k)}` : rotuloSerie(k))}
            onDica={setDica}
          />
        </section>
      </div>

      {/* Distribuições */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <section className={`${CARD} p-5`}>
          <h3 className={`${TITULO} mb-3`}>Chamados por categoria</h3>
          <Barras itens={dados.categorias} extra={(c) => (c.extra != null ? `resolve em ${duracao(c.extra)}` : null)} vazio="Nenhum chamado no período." />
        </section>
        <section className={`${CARD} p-5`}>
          <h3 className={`${TITULO} mb-3`}>Chamados por canal</h3>
          <Barras itens={dados.canais} nome={(n) => CANAIS[n] ?? n} vazio="Nenhum chamado no período." />
          <h3 className={`${TITULO} mt-5 mb-3`}>Por prioridade</h3>
          <Barras itens={dados.prioridades} nome={(n) => PRIORIDADES[n] ?? n} vazio="Nenhum chamado no período." />
        </section>
        <section className={`${CARD} p-5`}>
          <h3 className={`${TITULO} mb-3`}>WhatsApp por departamento</h3>
          <Barras itens={dados.departamentos} vazio="Nenhum atendimento no período." />
          <h3 className={`${TITULO} mt-5 mb-3`}>Como terminaram</h3>
          <Barras itens={dados.motivos} nome={(n) => MOTIVOS[n] ?? n} vazio="Nenhum atendimento no período." />
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Satisfação: distribuição das notas */}
        <section className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={TITULO}>Notas das avaliações</h3>
            <button type="button" onClick={() => onNavigate('avaliacoes')} className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer">
              Ver avaliações
            </button>
          </div>
          {totalNotas === 0 ? (
            <p className="text-xs text-stone-400 py-6 text-center">Nenhuma avaliação respondida no período.</p>
          ) : (
            <>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-black text-stone-900 dark:text-stone-100">{nota(a.satisfacao.media)}</span>
                <span className="text-xs text-stone-500 dark:text-stone-400 pb-1">média de {totalNotas} avaliação(ões)</span>
              </div>
              <Barras
                itens={[5, 4, 3, 2, 1].map((n) => ({ nome: String(n), qtd: dados.notas.find((x) => Number(x.nome) === n)?.qtd ?? 0 })).filter((x) => x.qtd > 0)}
                nome={(n) => `${n} ${'★'.repeat(Number(n))}`}
                vazio=""
              />
            </>
          )}
        </section>

        {/* Quando a demanda chega */}
        <section className={`${CARD} p-5 xl:col-span-2`}>
          <h3 className={`${TITULO} mb-1`}>Quando os atendimentos chegam</h3>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-3">Chamados abertos e atendimentos do WhatsApp por dia da semana e hora.</p>
          <MapaCalor celulas={dados.mapa} onDica={setDica} />
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Desempenho por técnico */}
        <section className={`${CARD} p-5 xl:col-span-2 overflow-x-auto`}>
          <h3 className={`${TITULO} mb-1`}>Por técnico</h3>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-3">Clique no técnico para ver os chamados dele.</p>
          {dados.tecnicos.length === 0 ? (
            <p className="text-xs text-stone-400 py-6 text-center">Nenhum atendimento com técnico no período.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-stone-500 dark:text-stone-400">
                <tr>
                  <th className="text-left font-semibold py-1.5">Técnico</th>
                  <th className="text-right font-semibold py-1.5">Chamados encerrados</th>
                  <th className="text-right font-semibold py-1.5">Tempo médio</th>
                  <th className="text-right font-semibold py-1.5">WhatsApp</th>
                  <th className="text-right font-semibold py-1.5">Nota média</th>
                </tr>
              </thead>
              <tbody>
                {dados.tecnicos.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onNavigateFiltrado('chamados', [{ field: 'atendente_id', op: 'eq', value: String(t.id) }])}
                    title={`Ver os chamados de ${t.nome} na Consulta de Chamados`}
                    className="border-t border-stone-100 dark:border-stone-800 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  >
                    <td className="py-1.5 text-blue-700 dark:text-blue-400 font-medium">{t.nome}</td>
                    <td className="py-1.5 text-right tabular-nums">{inteiro(t.encerrados)}</td>
                    <td className="py-1.5 text-right tabular-nums">{duracao(t.min_resolver)}</td>
                    <td className="py-1.5 text-right tabular-nums">{inteiro(t.whatsapp)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {t.media == null ? '—' : `${nota(t.media)} ★`}
                      {t.avaliacoes > 0 && <span className="text-stone-400"> ({t.avaliacoes})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Clientes que mais abriram chamados */}
        <section className={`${CARD} p-5`}>
          <h3 className={`${TITULO} mb-3`}>Clientes com mais chamados</h3>
          <Barras itens={dados.clientes} vazio="Nenhum chamado no período." />
        </section>
      </div>

      <DicaFlutuante dica={dica} />
    </div>
  );
};
