import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  FilePlus2,
  Loader2,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { TrocarProprietario } from './TrocarProprietario';
import { FichaNegocio, Id, OpcaoRef, RegistroCrud, ResourceDef } from '../types';
import {
  createRecord,
  deleteRecord,
  fetchFichaNegocio,
  fetchOptions,
  moverNegocio,
  mudarStatusNegocio,
  updateRecord,
} from '../services/api';
import { STATUS_COLORS, STATUS_LABELS, formatDateBR, formatDateTimeBR, formatMoeda } from '../utils/formatters';
import { INPUT_CLASS } from '../utils/formStyles';
import { COR_SEMAFORO, TIPOS_INTERACAO, iconeAtividade, iconeInteracao, quando, semaforoFollowup } from '../utils/crm';
import { AtividadeModal } from './AtividadeModal';
import { ConfirmDialog } from './ConfirmDialog';
import { DocumentoEditor } from './DocumentoEditor';
import { RecordForm } from './RecordForm';
import { AvisoErro } from './AvisoErro';

interface NegocioFichaProps {
  negocioId: Id;
  /** Metadados de negócios, para o formulário "Editar dados" */
  resource?: ResourceDef;
  onFechar: () => void;
  /** Algo mudou (etapa, status, atividades...): quem abriu recarrega a lista/Kanban */
  onAlterado: () => void;
  onToast: (msg: string) => void;
}

type Aba = 'atividades' | 'historico' | 'propostas' | 'pedidos';
type Visao = { tipo: 'ficha' } | { tipo: 'propostas' | 'pedidos'; id: Id | null };

export const NegocioFicha: React.FC<NegocioFichaProps> = ({ negocioId, resource, onFechar, onAlterado, onToast }) => {
  const [ficha, setFicha] = useState<FichaNegocio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('atividades');
  const [visao, setVisao] = useState<Visao>({ tipo: 'ficha' });
  const [editando, setEditando] = useState(false);
  const [refOptions, setRefOptions] = useState<Record<string, OpcaoRef[]>>({});
  const [agendando, setAgendando] = useState(false);
  const [perdendo, setPerdendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [excluindo, setExcluindo] = useState<{ recurso: string; registro: RegistroCrud; rotulo: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setFicha(await fetchFichaNegocio(negocioId));
      setErro(null);
    } catch (err: any) {
      setErro(err.message);
    }
  }, [negocioId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Ação de um clique: erro vira aviso na ficha, em vez de sumir no console */
  const tentar = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (err: any) {
      setErro(err.message || 'Não foi possível concluir a ação.');
    }
  };

  /** Recarrega a ficha e avisa quem abriu (Kanban/lista) */
  const alterou = async (msg?: string) => {
    if (msg) onToast(msg);
    await carregar();
    onAlterado();
  };

  const abrirEdicao = async () => {
    if (!resource) return;
    const map: Record<string, OpcaoRef[]> = {};
    for (const f of resource.fields.filter((c) => c.ref)) {
      map[f.name] = await fetchOptions(f.ref!.resource, f.ref!.labelField).catch(() => []);
    }
    setRefOptions(map);
    setEditando(true);
  };

  // ------------------------------------------------------------
  // Sub-telas: proposta e pedido abertos a partir do negócio
  // ------------------------------------------------------------
  if (visao.tipo !== 'ficha') {
    return (
      <DocumentoEditor
        key={`${visao.tipo}:${visao.id}`}
        tipo={visao.tipo}
        id={visao.id}
        negocioId={negocioId}
        negocioTitulo={ficha?.negocio.titulo}
        rotuloVoltar="Voltar ao negócio"
        onFechar={() => {
          setVisao({ tipo: 'ficha' });
          carregar();
        }}
        onGravado={() => onAlterado()}
        onAbrirPedido={(id) => {
          setAba('pedidos');
          setVisao({ tipo: 'pedidos', id });
        }}
        onToast={onToast}
      />
    );
  }

  if (!ficha) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-sm text-stone-500 p-10">
        {erro ? (
          <span className="text-rose-600">{erro}</span>
        ) : (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando o negócio…
          </>
        )}
      </div>
    );
  }

  const { negocio: n, etapas, atividades, historico, propostas, pedidos, participantes = [] } = ficha;
  const aberto = n.status === 'aberto';
  const pendentes = atividades.filter((a) => !Number(a.concluida));
  const proxima = pendentes[0];
  const semaforo = semaforoFollowup(proxima?.data_vencimento, proxima?.hora_vencimento);
  const idxEtapa = etapas.findIndex((e) => e.id === n.etapa_id);

  if (editando && resource) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center gap-3 shrink-0">
          <button onClick={() => setEditando(false)} title="Voltar" className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Editar dados do negócio</h3>
        </div>
        <RecordForm
          resource={resource}
          record={n}
          refOptions={refOptions}
          onCancel={() => setEditando(false)}
          onSave={async (payload) => {
            await updateRecord('negocios', negocioId, payload);
            setEditando(false);
            await alterou('Negócio atualizado.');
          }}
        />
      </div>
    );
  }

  // Linha do tempo: interações registradas + atividades concluídas, da mais recente para a mais antiga
  const timeline = [
    ...historico.map((h) => ({ chave: `h${h.id}`, data: h.criado_em, recurso: 'historico_interacoes', registro: h })),
    ...atividades
      .filter((a) => Number(a.concluida))
      .map((a) => ({ chave: `a${a.id}`, data: a.concluida_em || a.data_vencimento, recurso: 'atividades', registro: a })),
  ].sort((x, y) => String(y.data).localeCompare(String(x.data)));

  const botao = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Cabeçalho do negócio */}
      <div className="px-5 pt-4 pb-3 border-b border-stone-200 dark:border-stone-800 shrink-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 truncate">{n.titulo}</h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[n.status] || ''}`}>{STATUS_LABELS[n.status]}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
              <span className="text-base font-bold font-mono text-stone-800 dark:text-stone-100">{formatMoeda(n.valor, n.moeda)}</span>
              {n.pessoa_nome && (
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> {n.pessoa_nome}
                  {n.pessoa_telefone && <span className="text-stone-400">• {n.pessoa_telefone}</span>}
                </span>
              )}
              <span>{n.funil_nome}</span>
              <TrocarProprietario
                proprietarioId={n.proprietario_id}
                onEscolher={async (id) => {
                  try {
                    await updateRecord('negocios', negocioId, { proprietario_id: id });
                    await alterou('Proprietário alterado.');
                  } catch (err: any) {
                    setErro(err.message || 'Não foi possível trocar o proprietário.');
                  }
                }}
                title="Proprietário do negócio (clique para trocar)"
                className="flex items-center gap-1 rounded px-1 -mx-1 hover:bg-stone-100 hover:text-blue-700 dark:hover:bg-stone-800 dark:hover:text-blue-300 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" /> {n.proprietario_nome || 'Sem proprietário'}
              </TrocarProprietario>
              {participantes.length > 0 && (
                <span className="flex items-center gap-1" title="Envolvidos">
                  <Users className="w-3.5 h-3.5" /> {participantes.map((p) => p.nome).join(', ')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {aberto ? (
              <>
                <button onClick={tentar(async () => { await mudarStatusNegocio(negocioId, 'ganho'); await alterou('Negócio marcado como ganho.'); })} className={`${botao} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                  <ThumbsUp className="w-3.5 h-3.5" /> Ganho
                </button>
                <button onClick={() => { setMotivo(''); setPerdendo(true); }} className={`${botao} bg-rose-600 hover:bg-rose-700 text-white`}>
                  <ThumbsDown className="w-3.5 h-3.5" /> Perdido
                </button>
              </>
            ) : (
              <button onClick={tentar(async () => { await mudarStatusNegocio(negocioId, 'aberto'); await alterou('Negócio reaberto.'); })} className={`${botao} border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800`}>
                <RotateCcw className="w-3.5 h-3.5" /> Reabrir
              </button>
            )}
            {resource && (
              <button onClick={tentar(abrirEdicao)} title="Editar dados do negócio" className={`${botao} border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800`}>
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            <button onClick={onFechar} title="Fechar" className="p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Etapas do funil: clicar move o negócio */}
        <div className="flex gap-0.5">
          {etapas.map((e, i) => (
            <button
              key={e.id}
              disabled={!aberto || e.id === n.etapa_id}
              onClick={tentar(async () => {
                await moverNegocio(negocioId, e.id);
                await alterou(`Movido para ${e.nome}.`);
              })}
              title={`${e.nome} • ${Number(e.probabilidade)}%`}
              className={`flex-1 min-w-0 px-2 py-1.5 text-[11px] font-semibold truncate first:rounded-l-lg last:rounded-r-lg transition-colors disabled:cursor-default cursor-pointer ${
                i <= idxEtapa
                  ? 'bg-emerald-500 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
              }`}
            >
              {e.nome}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-stone-500 dark:text-stone-400">
          <span>Fechamento esperado: <strong className="text-stone-700 dark:text-stone-200">{formatDateBR(n.data_fechamento_esperada)}</strong></span>
          <span>Último contato: <strong className="text-stone-700 dark:text-stone-200">{formatDateTimeBR(n.data_ultimo_contato)}</strong></span>
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${COR_SEMAFORO[semaforo].ponto}`} />
            Próximo follow-up:{' '}
            <strong className={COR_SEMAFORO[semaforo].texto}>{proxima ? `${quando(proxima.data_vencimento, proxima.hora_vencimento)} — ${proxima.assunto}` : COR_SEMAFORO.amarelo.rotulo}</strong>
          </span>
          {n.status === 'perdido' && n.motivo_perda && <span>Motivo da perda: <strong className="text-rose-600">{n.motivo_perda}</strong></span>}
        </div>
      </div>

      {erro && (
        <AvisoErro mensagem={erro} onFechar={() => setErro(null)} className="mx-5 mt-3" />
      )}

      {/* Abas */}
      <div className="flex border-b border-stone-200 dark:border-stone-800 shrink-0 px-3 overflow-x-auto">
        {(
          [
            ['atividades', `Atividades${pendentes.length ? ` (${pendentes.length})` : ''}`],
            ['historico', 'Histórico'],
            ['propostas', `Propostas (${propostas.length})`],
            ['pedidos', `Pedidos (${pedidos.length})`],
          ] as [Aba, string][]
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            onClick={() => setAba(valor)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap cursor-pointer ${
              aba === valor ? 'border-blue-600 text-blue-700 dark:text-blue-400' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-5">
        {aba === 'atividades' && (
          <div className="space-y-3 max-w-4xl">
            <button onClick={() => setAgendando(true)} className={`${botao} bg-blue-600 hover:bg-blue-700 text-white`}>
              <CalendarPlus className="w-3.5 h-3.5" /> Agendar atividade
            </button>
            {atividades.length === 0 && <Vazio texto="Nenhuma atividade. Agende o próximo follow-up deste negócio." />}
            {atividades.map((a) => {
              const feita = Boolean(Number(a.concluida));
              const Icone = iconeAtividade(a.tipo);
              const cor = feita ? '' : COR_SEMAFORO[semaforoFollowup(a.data_vencimento, a.hora_vencimento)].texto;
              return (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border border-stone-200 dark:border-stone-800 group">
                  <button
                    onClick={tentar(async () => {
                      await updateRecord('atividades', a.id, { concluida: feita ? 0 : 1 });
                      await alterou(feita ? 'Atividade reaberta.' : 'Atividade concluída.');
                    })}
                    title={feita ? 'Marcar como pendente' : 'Marcar como concluída'}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                      feita ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-stone-300 dark:border-stone-600 hover:border-emerald-500 text-transparent hover:text-emerald-500'
                    }`}
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <Icone className="w-4 h-4 mt-0.5 text-stone-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold ${feita ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-100'}`}>{a.assunto}</div>
                    <div className={`text-[11px] ${cor || 'text-stone-400'}`}>
                      {quando(a.data_vencimento, a.hora_vencimento)}
                      {feita && a.concluida_em && ` • concluída em ${formatDateTimeBR(a.concluida_em)}`}
                    </div>
                    {a.observacao && <p className="mt-1 text-xs text-stone-600 dark:text-stone-300 whitespace-pre-wrap">{a.observacao}</p>}
                  </div>
                  <button onClick={() => setExcluindo({ recurso: 'atividades', registro: a, rotulo: a.assunto })} title="Excluir atividade" className="p-1 rounded text-stone-300 opacity-0 group-hover:opacity-100 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {aba === 'historico' && (
          <div className="space-y-4 max-w-4xl">
            <NovaInteracao
              onRegistrar={async (tipo, descricao) => {
                await createRecord('historico_interacoes', { negocio_id: negocioId, pessoa_id: n.pessoa_id, tipo, descricao });
                await alterou('Interação registrada.');
              }}
            />
            {timeline.length === 0 && <Vazio texto="Nenhuma interação registrada ainda." />}
            <ol className="relative border-l border-stone-200 dark:border-stone-800 ml-3 space-y-4">
              {timeline.map((t) => {
                const r = t.registro;
                const ehAtividade = t.recurso === 'atividades';
                const Icone = ehAtividade ? iconeAtividade(r.tipo) : iconeInteracao(r.tipo);
                return (
                  <li key={t.chave} className="ml-5 group">
                    <span className="absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700">
                      <Icone className="w-3.5 h-3.5 text-blue-600" />
                    </span>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[11px] text-stone-400">
                        {formatDateTimeBR(t.data)} •{' '}
                        {ehAtividade ? 'Atividade concluída' : TIPOS_INTERACAO.find((x) => x.value === r.tipo)?.label}
                      </div>
                      {!ehAtividade && (
                        <button onClick={() => setExcluindo({ recurso: 'historico_interacoes', registro: r, rotulo: 'esta interação' })} title="Excluir interação" className="p-1 rounded text-stone-300 opacity-0 group-hover:opacity-100 hover:text-rose-600 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-stone-700 dark:text-stone-200 whitespace-pre-wrap">
                      {ehAtividade ? <strong>{r.assunto}</strong> : r.descricao}
                      {ehAtividade && r.observacao ? `\n${r.observacao}` : ''}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {aba === 'propostas' && (
          <ListaDocumentos
            novo="Nova proposta"
            onNovo={() => setVisao({ tipo: 'propostas', id: null })}
            onAbrir={(id) => setVisao({ tipo: 'propostas', id })}
            linhas={propostas}
            colunas={[
              ['Proposta', (p) => `#${p.numero_proposta} v${p.versao}`],
              ['Título', (p) => p.titulo],
              ['Válida até', (p) => formatDateBR(p.data_validade), 'text-center'],
              ['Total', (p) => formatMoeda(p.valor_total), 'text-right font-mono'],
            ]}
          />
        )}

        {aba === 'pedidos' && (
          <ListaDocumentos
            novo="Novo pedido"
            onNovo={() => setVisao({ tipo: 'pedidos', id: null })}
            onAbrir={(id) => setVisao({ tipo: 'pedidos', id })}
            linhas={pedidos}
            colunas={[
              ['Pedido', (p) => `#${p.numero_pedido}`],
              ['Emissão', (p) => formatDateBR(p.data_emissao), 'text-center'],
              ['Condição', (p) => p.condicao_pagamento || '—'],
              ['Total', (p) => formatMoeda(p.valor_total), 'text-right font-mono'],
            ]}
          />
        )}
      </div>

      {agendando && (
        <AtividadeModal
          negocioId={negocioId}
          pessoaId={n.pessoa_id}
          contexto={n.titulo}
          onFechar={() => setAgendando(false)}
          onGravada={async () => {
            setAgendando(false);
            await alterou('Atividade agendada.');
          }}
        />
      )}

      {perdendo && (
        <ConfirmDialog
          titulo="Marcar negócio como perdido?"
          mensagem="Informe o motivo da perda. O negócio sai do funil e pode ser reaberto depois."
          confirmar="Marcar como perdido"
          onConfirmar={async () => {
            if (!motivo.trim()) throw new Error('Informe o motivo da perda.');
            await mudarStatusNegocio(negocioId, 'perdido', motivo.trim());
            setPerdendo(false);
            await alterou('Negócio marcado como perdido.');
          }}
          onCancelar={() => setPerdendo(false)}
        >
          <input autoFocus required value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} placeholder="Ex.: preço, prazo, escolheu concorrente…" className={`${INPUT_CLASS} w-full`} />
        </ConfirmDialog>
      )}

      {excluindo && (
        <ConfirmDialog
          titulo="Excluir?"
          mensagem={<><strong>{excluindo.rotulo}</strong> será removida definitivamente.</>}
          onConfirmar={async () => {
            await deleteRecord(excluindo.recurso, excluindo.registro.id);
            setExcluindo(null);
            await alterou('Excluído.');
          }}
          onCancelar={() => setExcluindo(null)}
        />
      )}
    </div>
  );
};

const Vazio: React.FC<{ texto: string }> = ({ texto }) => (
  <div className="py-8 text-center text-xs text-stone-400">{texto}</div>
);

/** Registro rápido de nota, ligação, e-mail, WhatsApp ou reunião realizados */
const NovaInteracao: React.FC<{ onRegistrar: (tipo: string, descricao: string) => Promise<void> }> = ({ onRegistrar }) => {
  const [tipo, setTipo] = useState('nota');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const registrar = async () => {
    if (!descricao.trim()) return setErro('Descreva a interação.');
    setSalvando(true);
    setErro(null);
    try {
      await onRegistrar(tipo, descricao.trim());
      setDescricao('');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 p-3 space-y-2.5 bg-stone-50/60 dark:bg-stone-950/30">
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_INTERACAO.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTipo(t.value)}
            aria-pressed={tipo === t.value}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
              tipo === t.value ? 'bg-blue-600 border-blue-600 text-white' : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="O que foi conversado? Ex.: cliente pediu desconto de 5% para fechar este mês."
        className={`${INPUT_CLASS} w-full resize-y`}
      />
      {erro && <p className="text-[11px] text-rose-600">{erro}</p>}
      <div className="flex justify-end">
        <button onClick={registrar} disabled={salvando} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50">
          {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Registrar
        </button>
      </div>
    </div>
  );
};

/** Lista compacta de propostas ou pedidos do negócio */
const ListaDocumentos: React.FC<{
  novo: string;
  onNovo: () => void;
  onAbrir: (id: Id) => void;
  linhas: RegistroCrud[];
  colunas: [string, (r: RegistroCrud) => React.ReactNode, string?][];
}> = ({ novo, onNovo, onAbrir, linhas, colunas }) => (
  <div className="space-y-3 max-w-5xl">
    <button onClick={onNovo} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">
      <FilePlus2 className="w-3.5 h-3.5" /> {novo}
    </button>
    {linhas.length === 0 ? (
      <Vazio texto="Nada por aqui ainda." />
    ) : (
      <table className="w-full text-xs border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
        <thead className="bg-stone-50 dark:bg-stone-950/60 text-stone-500">
          <tr>
            {colunas.map(([t, , alinh]) => (
              <th key={t} className={`px-3 py-2 font-semibold ${alinh?.includes('right') ? 'text-right' : alinh?.includes('center') ? 'text-center' : 'text-left'}`}>{t}</th>
            ))}
            <th className="px-3 py-2 font-semibold text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((r) => (
            <tr key={r.id} onClick={() => onAbrir(r.id)} className="border-t border-stone-100 dark:border-stone-800 hover:bg-blue-50 dark:hover:bg-stone-800 cursor-pointer">
              {colunas.map(([t, fn, alinh]) => (
                <td key={t} className={`px-3 py-2 text-stone-700 dark:text-stone-200 ${alinh || ''}`}>{fn(r)}</td>
              ))}
              <td className="px-3 py-2 text-center">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[r.status] || ''}`}>{STATUS_LABELS[r.status]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
