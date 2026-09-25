import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CopyPlus,
  Printer,
  Loader2,
  PackageSearch,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { Id, ItemDocumento, OpcaoRef, ProdutoBusca, RegistroCrud } from '../types';
import {
  TipoDocumento,
  aprovarProposta,
  buscarProdutos,
  fetchDocumento,
  fetchOptions,
  novaVersaoProposta,
  salvarDocumento,
} from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { STATUS_COLORS, STATUS_LABELS, formatDateBR, formatDateTimeBR, formatMoeda } from '../utils/formatters';
import { CONDICOES_PAGAMENTO } from '../utils/crm';
import { htmlDocumento } from '../utils/imprimirDocumento';
import { NumberField } from './NumberField';
import { SelectBusca } from './SelectBusca';
import { ConfirmDialog } from './ConfirmDialog';
import { AvisoErro } from './AvisoErro';

/** Opções do combo de condição de pagamento */
const OPCOES_CONDICAO = CONDICOES_PAGAMENTO.map((c) => ({ value: c, label: c }));

interface DocumentoEditorProps {
  tipo: TipoDocumento;
  /** null = inclusão */
  id: Id | null;
  /** Negócio de origem, para uma inclusão aberta a partir da ficha do negócio */
  negocioId?: Id | null;
  negocioTitulo?: string;
  /** Mostra "Voltar" em vez de "Fechar" */
  rotuloVoltar?: string;
  onFechar: () => void;
  /** Após gravar, versionar ou aprovar (para recarregar listas) */
  onGravado?: () => void;
  /** Abre o pedido gerado pela aprovação da proposta */
  onAbrirPedido?: (pedidoId: Id) => void;
  onToast: (msg: string) => void;
}

const STATUS_PROPOSTA_EDITAVEIS = ['rascunho', 'enviada', 'recusada', 'expirada'];
const STATUS_PEDIDO = ['rascunho', 'aguardando_aprovacao', 'aprovado', 'faturado', 'cancelado'];

const n = (v: string | number | null | undefined) => Number(v) || 0;
const centavos = (v: number) => Math.round(v * 100) / 100;
let seq = 0;
const novaChave = () => `i${++seq}`;

/** Prévia do cálculo feito pelo servidor: quantidade × preço − desconto do item */
function totaisDaTela(itens: ItemDocumento[], descontoAdicional: string) {
  const bruto = centavos(itens.reduce((s, i) => s + centavos(n(i.quantidade) * n(i.preco_unitario)), 0));
  const descItens = centavos(itens.reduce((s, i) => s + n(i.desconto), 0));
  const desconto = centavos(descItens + n(descontoAdicional));
  return { bruto, descItens, desconto, total: centavos(bruto - desconto) };
}

export const DocumentoEditor: React.FC<DocumentoEditorProps> = ({
  tipo,
  id: idInicial,
  negocioId,
  negocioTitulo,
  rotuloVoltar,
  onFechar,
  onGravado,
  onAbrirPedido,
  onToast,
}) => {
  const ehProposta = tipo === 'propostas';
  const [id, setId] = useState<Id | null>(idInicial);
  /** Incrementado para reler o documento: números e totais oficiais vêm do servidor */
  const [recarga, setRecarga] = useState(0);
  const [doc, setDoc] = useState<RegistroCrud | null>(null);
  const [carregando, setCarregando] = useState(Boolean(idInicial));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [cab, setCab] = useState<Record<string, string>>({
    titulo: negocioTitulo ? `Proposta — ${negocioTitulo}` : '',
    negocio_id: negocioId || '',
    pessoa_id: '',
    status: 'rascunho',
    validade_dias: '15',
    condicao: '',
    observacoes: '',
    controle: '',
  });
  const [itens, setItens] = useState<ItemDocumento[]>([]);
  const [descontoAdicional, setDescontoAdicional] = useState('');
  const [removendo, setRemovendo] = useState<ItemDocumento | null>(null);
  const [confirmando, setConfirmando] = useState<'aprovar' | 'versao' | null>(null);

  const [opcoes, setOpcoes] = useState<Record<string, OpcaoRef[]>>({});
  useEffect(() => {
    Promise.all([fetchOptions('negocios', 'titulo'), fetchOptions('pessoas', 'nome')])
      .then(([negocios, pessoas]) => setOpcoes({ negocios, pessoas }))
      .catch(() => {});
  }, []);

  // Carrega o documento salvo (e recarrega depois de gravar ou versionar)
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setCarregando(true);
    fetchDocumento(tipo, id)
      .then((d) => {
        if (!vivo) return;
        setDoc(d);
        setCab({
          titulo: d.titulo || '',
          negocio_id: d.negocio_id || '',
          pessoa_id: d.pessoa_id || '',
          status: d.status,
          validade_dias: String(d.validade_dias ?? ''),
          condicao: (ehProposta ? d.condicoes_pagamento : d.condicao_pagamento) || '',
          observacoes: d.observacoes || '',
          controle: d.controle || '',
        });
        const lidos: ItemDocumento[] = d.itens.map((i: RegistroCrud) => ({
          chave: novaChave(),
          produto_id: i.produto_id,
          produto_nome: i.produto_nome,
          codigo_sku: i.codigo_sku,
          unidade_medida: i.unidade_medida,
          quantidade: String(i.quantidade),
          preco_unitario: String(i.preco_unitario),
          desconto: n(i.desconto) ? String(i.desconto) : '',
        }));
        setItens(lidos);
        // O desconto adicional não tem coluna própria: é o que sobra além dos descontos dos itens
        const adicional = centavos(n(d.valor_desconto) - lidos.reduce((s, i) => s + n(i.desconto), 0));
        setDescontoAdicional(adicional > 0 ? adicional.toFixed(2) : '');
        setErro(null);
      })
      .catch((err) => vivo && setErro(err.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [id, recarga, tipo, ehProposta]);

  const status = doc?.status || cab.status;
  // Proposta aceita (já virou pedido) ou fechada (outra versão foi aceita) e pedido
  // faturado/cancelado não mudam mais
  const negociacaoFechada = ehProposta && (status === 'aceita' || status === 'fechada');
  const bloqueado = ehProposta ? negociacaoFechada : ['faturado', 'cancelado'].includes(doc?.status || '');
  const tot = useMemo(() => totaisDaTela(itens, descontoAdicional), [itens, descontoAdicional]);
  const campo = (nome: string) => (v: string) => setCab((c) => ({ ...c, [nome]: v }));

  // Documento antigo pode ter uma condição que não está na lista: ela entra como opção
  // para continuar aparecendo (e não sumir na próxima gravação)
  const opcoesCondicao = useMemo(() => {
    const atual = String(cab.condicao || '').trim();
    return atual && !CONDICOES_PAGAMENTO.includes(atual)
      ? [{ value: atual, label: atual }, ...OPCOES_CONDICAO]
      : OPCOES_CONDICAO;
  }, [cab.condicao]);

  const alterarItem = (chave: string, dados: Partial<ItemDocumento>) =>
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...dados } : i)));

  const incluirProduto = (p: ProdutoBusca) =>
    setItens((lista) => [
      ...lista,
      {
        chave: novaChave(),
        produto_id: p.id,
        produto_nome: p.nome,
        codigo_sku: p.codigo_sku,
        unidade_medida: p.unidade_medida,
        quantidade: '1.000',
        preco_unitario: p.preco_tabela.toFixed(2),
        desconto: '',
      },
    ]);

  /** Grava e devolve o id; lança o erro para quem chamou */
  const gravar = async (): Promise<string> => {
    const payload = {
      titulo: cab.titulo,
      negocio_id: cab.negocio_id || null,
      pessoa_id: cab.pessoa_id || null,
      status: cab.status,
      validade_dias: cab.validade_dias,
      [ehProposta ? 'condicoes_pagamento' : 'condicao_pagamento']: cab.condicao,
      observacoes: cab.observacoes,
      ...(ehProposta ? { controle: cab.controle } : {}),
      desconto_adicional: descontoAdicional || 0,
      itens: itens.map(({ produto_id, quantidade, preco_unitario, desconto }) => ({ produto_id, quantidade, preco_unitario, desconto: desconto || 0 })),
    };
    const r = await salvarDocumento(tipo, id, payload);
    return r.id;
  };

  const salvar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const novoId = await gravar();
      onToast(`${ehProposta ? 'Proposta' : 'Pedido'} salvo com sucesso.`);
      onGravado?.();
      setId(novoId);
      setRecarga((r) => r + 1);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const aprovar = async () => {
    // Grava o que está na tela antes: a aprovação clona o que está no banco
    const propostaId = await gravar();
    const r = await aprovarProposta(propostaId);
    onToast(`Proposta aprovada. Pedido #${r.numero_pedido} gerado.`);
    onGravado?.();
    setConfirmando(null);
    if (onAbrirPedido) onAbrirPedido(r.id);
    else {
      setId(propostaId);
      setRecarga((x) => x + 1);
    }
  };

  /** Imprime o documento como está gravado; alterações pendentes são salvas antes */
  const imprimir = async () => {
    // A aba abre ainda no clique: aberta depois de um await, o bloqueador de pop-up a barraria
    const janela = window.open('', '_blank');
    if (!janela) return setErro('O navegador bloqueou a nova aba. Libere pop-ups para este site e tente de novo.');
    janela.document.write(`<p style="font-family:sans-serif">Preparando ${ehProposta ? 'a proposta' : 'o pedido'}…</p>`);
    setSalvando(true);
    setErro(null);
    try {
      const docId = bloqueado ? id! : await gravar();
      const d = await fetchDocumento(tipo, docId);
      janela.document.open();
      janela.document.write(htmlDocumento(d, tipo));
      janela.document.close();
      if (!bloqueado) {
        onGravado?.();
        setId(docId);
        setRecarga((r) => r + 1);
      }
    } catch (err: any) {
      janela.close();
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const gerarVersao = async () => {
    const r = await novaVersaoProposta(id!);
    onToast('Nova versão da proposta criada.');
    onGravado?.();
    setConfirmando(null);
    setId(r.id);
  };

  const titulo = id
    ? ehProposta
      ? `Proposta #${doc?.numero_proposta ?? '…'} v${doc?.versao ?? ''}`
      : `Pedido #${doc?.numero_pedido ?? '…'}`
    : ehProposta
    ? 'Nova proposta'
    : 'Novo pedido';

  if (carregando && !doc) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <form onSubmit={salvar} className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Título */}
      <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center gap-3 shrink-0">
        {rotuloVoltar && (
          <button type="button" onClick={onFechar} title={rotuloVoltar} className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 dark:hover:text-white cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">{titulo}</h3>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[status] || ''}`}>{STATUS_LABELS[status] || status}</span>
        {doc && (
          <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
            {ehProposta
              ? `Válida até ${formatDateBR(doc.data_validade)}`
              : `Emissão ${formatDateTimeBR(doc.data_emissao)}${doc.proposta_numero ? ` • origem: proposta #${doc.proposta_numero} v${doc.proposta_versao}` : ''}`}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-6xl mx-auto px-5 py-5 space-y-5">
          {erro && (
            <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />
          )}
          {bloqueado && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
              {!ehProposta
                ? 'Pedido faturado ou cancelado: somente o status pode ser alterado.'
                : status === 'fechada'
                  ? 'Proposta fechada: outra versão desta proposta foi aceita pelo cliente. Ela fica só para consulta.'
                  : 'Proposta aceita: a negociação está fechada e não pode mais ser alterada. Para uma nova negociação, use Clonar na lista de propostas.'}
            </div>
          )}

          {/* Cabeçalho */}
          <fieldset disabled={bloqueado && ehProposta} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-0 p-0 m-0 min-w-0">
            {ehProposta && (
              <div className={`${FIELD_CLASS} sm:col-span-2`}>
                <label htmlFor="doc-titulo" className={LABEL_CLASS}>Título<span className="text-rose-500 ml-1">*</span></label>
                <input id="doc-titulo" required maxLength={255} value={cab.titulo} onChange={(e) => campo('titulo')(e.target.value)} className={`${INPUT_CLASS} w-full`} />
              </div>
            )}
            <div className={`${FIELD_CLASS} ${ehProposta ? '' : 'lg:col-span-3'}`}>
              <label htmlFor="doc-negocio" className={LABEL_CLASS}>Negócio{ehProposta && <span className="text-rose-500 ml-1">*</span>}</label>
              <SelectBusca
                id="doc-negocio"
                required={ehProposta}
                // A proposta pertence ao negócio para sempre: versões e pedido dependem disso
                disabled={ehProposta && Boolean(id || negocioId)}
                value={cab.negocio_id}
                options={opcoes.negocios || []}
                onChange={campo('negocio_id')}
                vazioLabel={ehProposta ? '— Selecione —' : '— Sem negócio —'}
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
            <div className={FIELD_CLASS}>
              <label htmlFor="doc-status" className={LABEL_CLASS}>Status</label>
              <select
                id="doc-status"
                value={cab.status}
                onChange={(e) => campo('status')(e.target.value)}
                disabled={negociacaoFechada}
                className={`${INPUT_CLASS} w-full cursor-pointer`}
              >
                {(ehProposta ? (negociacaoFechada ? [status] : STATUS_PROPOSTA_EDITAVEIS) : STATUS_PEDIDO).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset disabled={bloqueado} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-0 p-0 m-0 mb-2.5 min-w-0">
            {ehProposta && (
              <div className={FIELD_CLASS}>
                <label htmlFor="doc-controle" className={LABEL_CLASS}>Controle</label>
                <input
                  id="doc-controle"
                  maxLength={30}
                  value={cab.controle}
                  onChange={(e) => campo('controle')(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder={id ? '' : 'Automático (AAAA/NNN-01)'}
                  title="Controle livre da proposta. Em branco na inclusão: ano/sequência e versão (ex.: 2026/001-01); as versões seguintes ganham -02, -03…"
                  className={`${INPUT_CLASS} w-full`}
                />
              </div>
            )}
            {ehProposta && (
              <div className={FIELD_CLASS}>
                <label htmlFor="doc-validade" className={LABEL_CLASS}>Validade (dias)</label>
                <NumberField id="doc-validade" value={cab.validade_dias} onChange={campo('validade_dias')} className={`${INPUT_CLASS} w-full`} />
              </div>
            )}
            <div className={`${FIELD_CLASS} ${ehProposta ? '' : 'lg:col-span-2'}`}>
              <label htmlFor="doc-pessoa" className={LABEL_CLASS}>Cliente (contato)</label>
              <SelectBusca
                id="doc-pessoa"
                value={cab.pessoa_id}
                options={opcoes.pessoas || []}
                onChange={campo('pessoa_id')}
                vazioLabel={cab.negocio_id ? '— O do negócio —' : '— Nenhum —'}
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
            <div className={`${FIELD_CLASS} ${ehProposta ? '' : 'lg:col-span-2'}`}>
              <label htmlFor="doc-condicao" className={LABEL_CLASS}>{ehProposta ? 'Condições de Pagamento' : 'Condição de Pagamento'}</label>
              <SelectBusca
                id="doc-condicao"
                value={cab.condicao}
                options={opcoesCondicao}
                onChange={campo('condicao')}
                vazioLabel="— Escolha —"
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
          </fieldset>

          {/* Itens */}
          <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-stone-50 dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-stone-700 dark:text-stone-200">Itens ({itens.length})</span>
              {!bloqueado && <BuscaProduto onEscolher={incluirProduto} />}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-stone-50/60 dark:bg-stone-950/30 text-stone-500 dark:text-stone-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Produto</th>
                    <th className="px-3 py-2 text-right font-semibold w-28">Quantidade</th>
                    <th className="px-3 py-2 text-center font-semibold w-14">Un.</th>
                    <th className="px-3 py-2 text-right font-semibold w-32">Preço Unit.</th>
                    <th className="px-3 py-2 text-right font-semibold w-32">Desconto (R$)</th>
                    <th className="px-3 py-2 text-right font-semibold w-32">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-stone-400">
                        <PackageSearch className="w-6 h-6 mx-auto mb-1.5" />
                        Pesquise um produto do catálogo para incluir o primeiro item.
                      </td>
                    </tr>
                  )}
                  {itens.map((i) => {
                    const sub = centavos(n(i.quantidade) * n(i.preco_unitario) - n(i.desconto));
                    return (
                      <tr key={i.chave} className="border-t border-stone-100 dark:border-stone-800/60">
                        <td className="px-3 py-1.5">
                          <div className="font-semibold text-stone-800 dark:text-stone-100">{i.produto_nome}</div>
                          {i.codigo_sku && <div className="text-[10px] font-mono text-stone-400">{i.codigo_sku}</div>}
                        </td>
                        <td className="px-3 py-1.5">
                          <NumberField value={i.quantidade} scale={3} disabled={bloqueado} onChange={(v) => alterarItem(i.chave, { quantidade: v })} className={`${INPUT_CLASS} w-full`} />
                        </td>
                        <td className="px-3 py-1.5 text-center text-stone-500">{i.unidade_medida}</td>
                        <td className="px-3 py-1.5">
                          <NumberField value={i.preco_unitario} scale={2} disabled={bloqueado} onChange={(v) => alterarItem(i.chave, { preco_unitario: v })} className={`${INPUT_CLASS} w-full`} />
                        </td>
                        <td className="px-3 py-1.5">
                          <NumberField value={i.desconto} scale={2} disabled={bloqueado} onChange={(v) => alterarItem(i.chave, { desconto: v })} className={`${INPUT_CLASS} w-full`} />
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${sub < 0 ? 'text-rose-600' : 'text-stone-800 dark:text-stone-100'}`}>
                          {formatMoeda(sub)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {!bloqueado && (
                            <button type="button" onClick={() => setRemovendo(i)} title="Remover item" className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Observações e totais */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className={`${FIELD_CLASS} lg:col-span-2`}>
              <label htmlFor="doc-obs" className={LABEL_CLASS}>Observações</label>
              <textarea id="doc-obs" rows={5} disabled={bloqueado} value={cab.observacoes} onChange={(e) => campo('observacoes')(e.target.value)} className={`${INPUT_CLASS} w-full resize-y`} />
            </div>
            <div className="bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700/60 rounded-xl p-4 space-y-2 text-xs">
              <Linha rotulo="Subtotal (bruto)" valor={formatMoeda(tot.bruto)} />
              <Linha rotulo="Descontos nos itens" valor={`− ${formatMoeda(tot.descItens)}`} />
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="doc-desc-adic" className="text-stone-500 dark:text-stone-400">Desconto adicional</label>
                <NumberField id="doc-desc-adic" value={descontoAdicional} scale={2} disabled={bloqueado} onChange={setDescontoAdicional} className={`${INPUT_CLASS} w-32`} />
              </div>
              <div className="pt-2 border-t border-stone-200 dark:border-stone-700 flex items-center justify-between">
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100">Total</span>
                <span className={`text-lg font-bold font-mono ${tot.total < 0 ? 'text-rose-600' : 'text-blue-700 dark:text-blue-400'}`}>{formatMoeda(tot.total)}</span>
              </div>
              <p className={HINT_CLASS}>Os totais são recalculados pelo servidor ao salvar.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2.5 bg-stone-50 dark:bg-stone-950/40 shrink-0">
        <div className="flex items-center gap-2">
          <button type="button" onClick={imprimir} disabled={salvando} title="Abre o documento para imprimir ou salvar em PDF (salva as alterações antes)" className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40">
            <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
          </button>
          {ehProposta && id && !negociacaoFechada && (
            <button type="button" onClick={() => setConfirmando('versao')} disabled={salvando} title="Renegociação: copia esta proposta como a próxima versão" className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40">
              <CopyPlus className="w-3.5 h-3.5" /> Nova versão
            </button>
          )}
          {ehProposta && id && !negociacaoFechada && (
            <button type="button" onClick={() => setConfirmando('aprovar')} disabled={salvando} className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer disabled:opacity-40">
              <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar Proposta e Gerar Pedido
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onFechar} disabled={salvando} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40">
            <X className="w-3.5 h-3.5" /> {rotuloVoltar ? 'Voltar' : 'Fechar'}
          </button>
          {!(bloqueado && ehProposta) && (
            <button type="submit" disabled={salvando} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer disabled:opacity-50">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{salvando ? 'Salvando…' : 'Salvar'}</span>
            </button>
          )}
        </div>
      </div>

      {removendo && (
        <ConfirmDialog
          titulo="Remover item?"
          mensagem={<><strong>{removendo.produto_nome}</strong> sai da lista. A remoção só vale depois de salvar.</>}
          confirmar="Remover"
          onConfirmar={() => {
            setItens((lista) => lista.filter((i) => i.chave !== removendo.chave));
            setRemovendo(null);
          }}
          onCancelar={() => setRemovendo(null)}
        />
      )}
      {confirmando === 'aprovar' && (
        <ConfirmDialog
          titulo="Aprovar proposta e gerar pedido?"
          mensagem={<>A proposta é salva, marcada como <strong>aceita</strong> e seus itens são copiados para um novo pedido de venda em rascunho. Total: <strong>{formatMoeda(tot.total)}</strong>. As outras versões desta proposta, se houver, ficam como <strong>fechadas</strong>.</>}
          confirmar="Aprovar e gerar pedido"
          tom="normal"
          onConfirmar={aprovar}
          onCancelar={() => setConfirmando(null)}
        />
      )}
      {confirmando === 'versao' && (
        <ConfirmDialog
          titulo="Gerar nova versão?"
          mensagem={<>A proposta salva é copiada como a próxima versão, em rascunho, para renegociação.{status === 'enviada' && ' Esta versão enviada passa a constar como recusada.'} Alterações não salvas nesta tela não vão para a cópia.</>}
          confirmar="Gerar versão"
          tom="normal"
          onConfirmar={gerarVersao}
          onCancelar={() => setConfirmando(null)}
        />
      )}
    </form>
  );
};

const Linha: React.FC<{ rotulo: string; valor: string }> = ({ rotulo, valor }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-stone-500 dark:text-stone-400">{rotulo}</span>
    <span className="font-mono font-semibold text-stone-800 dark:text-stone-100">{valor}</span>
  </div>
);

/** Pesquisa no catálogo (nome, SKU ou descrição) com lista suspensa; Enter inclui o primeiro */
const BuscaProduto: React.FC<{ onEscolher: (p: ProdutoBusca) => void }> = ({ onEscolher }) => {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const ultimo = useRef(0);

  useEffect(() => {
    if (!aberto) return;
    const pedido = ++ultimo.current;
    setBuscando(true);
    const t = setTimeout(() => {
      buscarProdutos(termo)
        .then((r) => pedido === ultimo.current && setResultados(r))
        .catch(() => pedido === ultimo.current && setResultados([]))
        .finally(() => pedido === ultimo.current && setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [termo, aberto]);

  const escolher = (p: ProdutoBusca) => {
    onEscolher(p);
    setTermo('');
    setAberto(false);
  };

  return (
    <div className="relative w-72 max-w-full">
      <PackageSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
      <input
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (resultados[0]) escolher(resultados[0]);
          }
          if (e.key === 'Escape') setAberto(false);
        }}
        placeholder="Incluir produto: nome ou SKU…"
        className={`${INPUT_CLASS} w-full pl-9`}
      />
      {aberto && (
        <div className="absolute right-0 top-full mt-1 z-30 w-96 max-w-[90vw] max-h-72 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl">
          {buscando && resultados.length === 0 && <div className="px-3 py-3 text-xs text-stone-500">Pesquisando…</div>}
          {!buscando && resultados.length === 0 && <div className="px-3 py-3 text-xs text-stone-500">Nenhum produto ativo encontrado.</div>}
          {resultados.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(p)}
              className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-stone-800 dark:text-stone-100 truncate">{p.nome}</span>
                <span className="block text-[10px] font-mono text-stone-400">{p.codigo_sku || '—'} • {p.unidade_medida}</span>
              </span>
              <span className="text-xs font-mono font-semibold text-stone-700 dark:text-stone-200 shrink-0">{formatMoeda(p.preco_tabela)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
