import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eraser, FileDown, Loader2, XCircle } from 'lucide-react';
import { formatDateBR, formatDateTimeBR, formatMoeda } from '../utils/formatters';
import { INPUT_CLASS_LG, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';
import { Toggle } from './Toggle';

type Situacao = 'aberta' | 'aceita' | 'recusada' | 'vencida' | 'substituida' | 'fechada';

interface PropostaPublica {
  situacao: Situacao;
  numero: number;
  versao: number;
  titulo: string;
  cliente: string | null;
  empresa: { nome: string; cnpj: string | null; endereco: string | null; logo: string | null };
  data_validade: string | null;
  condicoes_pagamento: string | null;
  observacoes: string | null;
  valor_subtotal: number;
  valor_desconto: number;
  valor_total: number;
  itens: { produto: string; unidade: string | null; quantidade: number; preco_unitario: number; desconto: number; subtotal: number }[];
  decisao: { nome: string; em: string } | null;
}

const api = (token: string, acao = '') => `/api/publico/propostas/${encodeURIComponent(token)}${acao}`;

async function postar(url: string, corpo: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Não foi possível concluir agora. Tente de novo.');
}

/** Quadro de assinatura: desenha com o dedo, a caneta ou o mouse */
const QuadroAssinatura: React.FC<{ onMudar: (png: string | null) => void }> = ({ onMudar }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const vazio = useRef(true);

  // Resolução na densidade da tela (traço nítido no celular)
  useEffect(() => {
    const c = canvas.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.offsetWidth * dpr;
    c.height = c.offsetHeight * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c1917';
  }, []);

  const ponto = (e: React.PointerEvent) => {
    const b = canvas.current!.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };
  const inicio = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const ctx = canvas.current!.getContext('2d')!;
    const [x, y] = ponto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };
  const mover = (e: React.PointerEvent) => {
    if (!desenhando.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    const [x, y] = ponto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    vazio.current = false;
  };
  const fim = () => {
    if (!desenhando.current) return;
    desenhando.current = false;
    onMudar(vazio.current ? null : canvas.current!.toDataURL('image/png'));
  };
  const limpar = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    vazio.current = true;
    onMudar(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative rounded-xl border-2 border-dashed border-stone-300 bg-white">
        <canvas
          ref={canvas}
          className="w-full h-40 touch-none cursor-crosshair block"
          onPointerDown={inicio}
          onPointerMove={mover}
          onPointerUp={fim}
          onPointerLeave={fim}
          onPointerCancel={fim}
        />
        <div className="absolute left-4 right-4 bottom-8 border-b border-stone-300 pointer-events-none" />
        <button type="button" onClick={limpar} className="absolute top-2 right-2 flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 bg-white/80 px-2 py-1 rounded-lg cursor-pointer">
          <Eraser className="w-3.5 h-3.5" /> Limpar
        </button>
      </div>
      <span className="text-[11px] text-stone-400">Assine dentro do quadro, com o dedo ou o mouse.</span>
    </div>
  );
};

const MENSAGENS: Record<Exclude<Situacao, 'aberta'>, { titulo: string; texto: string; ok: boolean }> = {
  aceita: { titulo: 'Proposta aprovada', texto: 'Obrigado! Recebemos a sua aprovação e já vamos dar andamento.', ok: true },
  recusada: { titulo: 'Proposta recusada', texto: 'Recebemos a sua resposta. Obrigado pelo retorno.', ok: false },
  vencida: { titulo: 'Proposta vencida', texto: 'O prazo de validade desta proposta terminou. Fale com o seu vendedor para receber uma proposta atualizada.', ok: false },
  substituida: { titulo: 'Proposta substituída', texto: 'Existe uma versão mais nova desta proposta. Use o link da última versão que enviamos.', ok: false },
  fechada: { titulo: 'Proposta encerrada', texto: 'Outra versão desta proposta já foi aprovada.', ok: false },
};

/** Tela pública do link /p/<token>: o cliente confere a proposta e aprova com assinatura ou recusa */
export const AceiteProposta: React.FC<{ token: string }> = ({ token }) => {
  const [p, setP] = useState<PropostaPublica | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [modo, setModo] = useState<'aprovar' | 'recusar'>('aprovar');
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [concordo, setConcordo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () =>
    fetch(api(token))
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Não foi possível abrir a proposta.');
        setP(d);
        document.title = `Proposta nº ${d.numero} — ${d.empresa.nome}`;
      })
      .catch((e) => setErroCarga(e.message));
  useEffect(() => {
    carregar();
  }, [token]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (modo === 'aprovar') await postar(api(token, '/aceitar'), { nome, documento, assinatura, concordo });
      else await postar(api(token, '/recusar'), { nome, motivo });
      await carregar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (erroCarga) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 max-w-md text-center text-sm text-stone-700">{erroCarga}</div>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  const aviso = p.situacao !== 'aberta' ? MENSAGENS[p.situacao] : null;
  const podeAprovar = nome.trim().length >= 3 && [11, 14].includes(documento.length) && assinatura && concordo;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Empresa */}
        <header className="flex items-center gap-3">
          {p.empresa.logo && <img src={p.empresa.logo} alt="" className="h-12 max-w-[140px] object-contain" />}
          <div>
            <div className="font-bold text-stone-900">{p.empresa.nome}</div>
            {p.empresa.cnpj && <div className="text-xs text-stone-500">CNPJ {p.empresa.cnpj}</div>}
          </div>
        </header>

        {aviso && (
          <div className={`rounded-2xl p-4 flex gap-3 items-start ${aviso.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
            {aviso.ok ? <CheckCircle2 className="w-6 h-6 shrink-0" /> : <XCircle className="w-6 h-6 shrink-0" />}
            <div>
              <div className="font-bold">{aviso.titulo}</div>
              <div className="text-sm">{aviso.texto}</div>
              {p.decisao && (
                <div className="text-xs mt-1 opacity-80">
                  Por {p.decisao.nome} em {formatDateTimeBR(p.decisao.em)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Proposta */}
        <section className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Proposta nº {p.numero} • versão {p.versao}
              </div>
              <h1 className="text-lg font-bold text-stone-900">{p.titulo}</h1>
              {p.cliente && <div className="text-sm text-stone-500">Para: {p.cliente}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-400">Valor total</div>
              <div className="text-2xl font-bold text-stone-900 tabular-nums">{formatMoeda(p.valor_total)}</div>
              {p.data_validade && <div className="text-xs text-stone-500">Válida até {formatDateBR(p.data_validade)}</div>}
            </div>
          </div>

          <div className="divide-y divide-stone-100 border-y border-stone-100">
            {p.itens.map((i, n) => (
              <div key={n} className="py-2 flex justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium text-stone-900">{i.produto}</div>
                  <div className="text-xs text-stone-500 tabular-nums">
                    {i.quantidade.toLocaleString('pt-BR')} {i.unidade || 'un'} × {formatMoeda(i.preco_unitario)}
                    {i.desconto > 0 && ` • desconto ${formatMoeda(i.desconto)}`}
                  </div>
                </div>
                <div className="font-semibold tabular-nums text-right whitespace-nowrap">{formatMoeda(i.subtotal)}</div>
              </div>
            ))}
          </div>

          <div className="text-sm space-y-1 tabular-nums">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span>
              <span>{formatMoeda(p.valor_subtotal)}</span>
            </div>
            {p.valor_desconto > 0 && (
              <div className="flex justify-between text-stone-500">
                <span>Descontos</span>
                <span>− {formatMoeda(p.valor_desconto)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-stone-900">
              <span>Total</span>
              <span>{formatMoeda(p.valor_total)}</span>
            </div>
          </div>

          {p.condicoes_pagamento && (
            <div className="text-sm">
              <div className="text-xs font-semibold text-stone-400">Condições de pagamento</div>
              <div className="whitespace-pre-wrap">{p.condicoes_pagamento}</div>
            </div>
          )}
          {p.observacoes && (
            <div className="text-sm">
              <div className="text-xs font-semibold text-stone-400">Observações</div>
              <div className="whitespace-pre-wrap">{p.observacoes}</div>
            </div>
          )}

          <a
            href={api(token, '/pdf')}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            <FileDown className="w-4 h-4" /> Ver a proposta completa em PDF
          </a>
        </section>

        {/* Resposta */}
        {p.situacao === 'aberta' && (
          <form onSubmit={enviar} className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex gap-2">
              {(['aprovar', 'recusar'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setModo(m);
                    setErro(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer border ${
                    modo === m
                      ? m === 'aprovar'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-rose-600 border-rose-600 text-white'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {m === 'aprovar' ? 'Aprovar a proposta' : 'Recusar'}
                </button>
              ))}
            </div>

            <div className={FIELD_CLASS}>
              <label htmlFor="ac-nome" className={LABEL_CLASS}>Seu nome completo</label>
              <input id="ac-nome" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={150} autoComplete="name" className={`${INPUT_CLASS_LG} w-full`} />
            </div>

            {modo === 'aprovar' ? (
              <>
                <div className={FIELD_CLASS}>
                  <label htmlFor="ac-doc" className={LABEL_CLASS}>CPF ou CNPJ</label>
                  <input
                    id="ac-doc"
                    required
                    inputMode="numeric"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value.replace(/\D/g, '').slice(0, 14))}
                    placeholder="Só os números"
                    className={`${INPUT_CLASS_LG} w-full`}
                  />
                </div>
                <div className={FIELD_CLASS}>
                  <span className={LABEL_CLASS}>Assinatura</span>
                  <QuadroAssinatura onMudar={setAssinatura} />
                </div>
                <Toggle
                  checked={concordo}
                  onChange={setConcordo}
                  label={
                    <span className="text-sm text-stone-700">
                      Li e aprovo a proposta nº {p.numero} (versão {p.versao}), no valor de {formatMoeda(p.valor_total)}.
                    </span>
                  }
                />
              </>
            ) : (
              <div className={FIELD_CLASS}>
                <label htmlFor="ac-motivo" className={LABEL_CLASS}>Motivo da recusa</label>
                <textarea id="ac-motivo" required value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1000} className={`${INPUT_CLASS_LG} w-full resize-y`} />
              </div>
            )}

            {erro && <div className="p-3 rounded-lg bg-rose-50 text-rose-800 text-sm">{erro}</div>}

            <button
              type="submit"
              disabled={enviando || (modo === 'aprovar' ? !podeAprovar : nome.trim().length < 3 || !motivo.trim())}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                modo === 'aprovar' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
              {modo === 'aprovar' ? 'Aprovar e assinar' : 'Confirmar recusa'}
            </button>
            <p className="text-[11px] text-stone-400 text-center">
              Ao {modo === 'aprovar' ? 'aprovar' : 'recusar'}, registramos a data e a hora, o seu IP e o navegador, como comprovante desta resposta.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
