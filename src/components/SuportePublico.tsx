import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Download, Headset, Loader2, MonitorSmartphone, Send, Star } from 'lucide-react';
import { formatDateTimeBR } from '../utils/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { destravarSom, tocarAviso } from '../utils/som';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';

/**
 * Página pública /suporte?e=<empresa> (dentro do painel do widget.js, no site do cliente): abre o
 * chamado e conversa com a equipe (server/suporte.ts). O token do chamado fica neste navegador:
 * voltando ao site, a conversa continua de onde parou.
 */

interface Chamado {
  numero: number;
  titulo: string;
  status: string;
  atendente: string | null;
  posicao: number | null;
  avaliado: boolean;
  mensagens: { id: number; autor: 'cliente' | 'equipe'; texto: string; criado_em: string; usuario_nome: string | null }[];
}

const api = async (url: string, corpo?: unknown) => {
  const r = await fetch(url, corpo === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Não foi possível concluir agora. Tente de novo.');
  return d;
};

/** O storage pode estar bloqueado (iframe de outro site, modo privado): sem ele, vale só enquanto a página está aberta */
const ler = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravar = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // sem storage
  }
};

const soDigitos = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

/** Pedido de tela remota do técnico (server/chamados.ts): vira o cartão com o botão do AnyDesk */
const TELA_REMOTA = '[[anydesk]]';
/** Cutucão do técnico (server/chamados.ts): som, tremida e aviso ao site (widget.js) */
const CUTUCAR = '[[cutucar]]';

/** Número do AnyDesk que o cliente enviou (server/suporte.ts) */
const ID_ANYDESK = /^\[\[anydesk-id:(\d+)\]\]$/;
/** "123456789" → "123 456 789" (como o AnyDesk mostra) */
const formatarAnydesk = (id: string) => id.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Cartão "Tela remota": o navegador só abre o AnyDesk (protocolo anydesk:) com um clique da pessoa.
 * Sem o AnyDesk instalado, o clique não faz nada: por isso o link para baixar. O cliente cola o
 * número do AnyDesk no campo e o técnico conecta direto (fica gravado no cadastro dele).
 */
const CartaoTelaRemota: React.FC<{ tecnico: string; quando: string; ultimo: boolean; enviado: boolean; url: string; onEnviado: () => void }> = ({
  tecnico,
  quando,
  ultimo,
  enviado,
  url,
  onEnviado,
}) => {
  const [id, setId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api(`${url}/anydesk`, { id });
      onEnviado();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className={`self-start max-w-[90%] rounded-2xl rounded-bl-md border px-3 py-2.5 text-sm ${ultimo ? 'bg-rose-50 border-rose-200' : 'bg-white border-stone-200'}`}>
      <div className="flex items-center gap-2 font-semibold text-rose-700">
        <MonitorSmartphone className="w-4 h-4" /> Acesso remoto
      </div>
      <p className="text-xs text-stone-600 mt-1">
        {tecnico} pediu para ver a sua tela e ajudar. Abra o AnyDesk e informe abaixo o número que aparece em "Seu endereço".
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        <a href="anydesk://" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold">
          <MonitorSmartphone className="w-3.5 h-3.5" /> Abrir AnyDesk
        </a>
        <a href="https://anydesk.com/pt/downloads" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 text-xs font-semibold">
          <Download className="w-3.5 h-3.5" /> Não tenho o AnyDesk
        </a>
      </div>
      {!enviado && (
        <form onSubmit={enviar} className="flex gap-2 mt-2">
          <input
            value={id}
            onChange={(e) => setId(e.target.value.replace(/[^\d ]/g, '').slice(0, 15))}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            placeholder="Número do AnyDesk"
            aria-label="Número do AnyDesk"
            className={`${INPUT_CLASS} flex-1 min-w-0 text-sm`}
          />
          <button type="submit" disabled={enviando || id.replace(/\D/g, '').length < 9} className="px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-40">
            {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Enviar'}
          </button>
        </form>
      )}
      {erro && <p className="text-xs text-rose-700 mt-1">{erro}</p>}
      <div className="text-[10px] mt-1 text-right text-stone-400">{formatDateTimeBR(quando)}</div>
    </div>
  );
};

export const SuportePublico: React.FC<{ empresa: string; cnpj: string }> = ({ empresa, cnpj }) => {
  const chaveToken = `crmweb_suporte_${empresa}`;
  const chaveDados = `crmweb_suporte_dados_${empresa}`;
  const [info, setInfo] = useState<{ empresa: { nome: string; logo: string | null }; categorias: { id: number; nome: string }[] } | null>(null);
  const [token, setToken] = useState<string | null>(() => ler(chaveToken));
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api(`/api/publico/suporte/${encodeURIComponent(empresa)}`)
      .then(setInfo)
      .catch((e) => setErro(e.message));
  }, [empresa]);

  /** Aviso no topo do formulário (atendimento anterior que acabou de terminar) */
  const [aviso, setAviso] = useState<string | null>(null);
  const trocarToken = (t: string | null, msg: string | null = null) => {
    gravar(chaveToken, t);
    setToken(t);
    setAviso(msg);
  };

  if (!info) {
    return <div className="h-screen flex items-center justify-center text-sm text-stone-500 p-4">{erro ?? <Loader2 className="w-6 h-6 animate-spin text-stone-400" />}</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-stone-50 text-stone-800">
      <header className="px-4 py-3 bg-blue-600 text-white flex items-center gap-3 shrink-0">
        {info.empresa.logo ? (
          <img src={info.empresa.logo} alt="" className="h-8 w-8 rounded-full bg-white object-contain p-0.5" />
        ) : (
          <Headset className="w-7 h-7" />
        )}
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">Suporte {info.empresa.nome}</div>
          <div className="text-[11px] text-blue-100">Fale com a nossa equipe</div>
        </div>
      </header>
      {token ? (
        <Conversa token={token} onNovo={(msg) => trocarToken(null, msg ?? null)} />
      ) : (
        <Abrir empresa={empresa} cnpj={cnpj} categorias={info.categorias} chaveDados={chaveDados} aviso={aviso} onAberto={(t) => trocarToken(t)} />
      )}
    </div>
  );
};

const Abrir: React.FC<{
  empresa: string;
  cnpj: string;
  categorias: { id: number; nome: string }[];
  chaveDados: string;
  aviso: string | null;
  onAberto: (token: string) => void;
}> = ({ empresa, cnpj, categorias, chaveDados, aviso, onAberto }) => {
  // Nome, WhatsApp e CNPJ da última vez vêm preenchidos
  const salvos = (() => {
    try {
      return JSON.parse(ler(chaveDados) || '{}');
    } catch {
      return {};
    }
  })();
  const [v, setV] = useState({
    documento: soDigitos(cnpj || salvos.documento || '', 14),
    nome: salvos.nome || '',
    telefone: salvos.telefone || '',
    categoria_id: '',
    descricao: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const alterar = (m: Partial<typeof v>) => setV({ ...v, ...m });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = await api(`/api/publico/suporte/${encodeURIComponent(empresa)}/chamados`, { ...v, categoria_id: Number(v.categoria_id) || null });
      gravar(chaveDados, JSON.stringify({ documento: v.documento, nome: v.nome, telefone: v.telefone }));
      onAberto(r.token);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  // Foco no primeiro campo vazio
  const primeiroVazio = !v.documento ? 'sp-doc' : !v.nome ? 'sp-nome' : !v.telefone ? 'sp-tel' : categorias.length ? 'sp-cat' : 'sp-desc';
  const campo = `${INPUT_CLASS} w-full`;

  return (
    <form onSubmit={enviar} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
      {aviso && (
        <p className="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {aviso}
        </p>
      )}
      <p className="text-xs text-stone-600">Conte o que está acontecendo. O primeiro atendente livre continua a conversa por aqui.</p>
      <div className={FIELD_CLASS}>
        <label htmlFor="sp-doc" className={LABEL_CLASS}>CNPJ da empresa (ou CPF)</label>
        <input id="sp-doc" autoFocus={primeiroVazio === 'sp-doc'} inputMode="numeric" value={v.documento} onChange={(e) => alterar({ documento: soDigitos(e.target.value, 14) })} onFocus={(e) => e.target.select()} placeholder="Só os números" className={campo} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={FIELD_CLASS}>
          <label htmlFor="sp-nome" className={LABEL_CLASS}>Seu nome</label>
          <input id="sp-nome" autoFocus={primeiroVazio === 'sp-nome'} value={v.nome} onChange={(e) => alterar({ nome: e.target.value })} onFocus={(e) => e.target.select()} maxLength={120} autoComplete="name" className={campo} />
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="sp-tel" className={LABEL_CLASS}>WhatsApp</label>
          <input id="sp-tel" autoFocus={primeiroVazio === 'sp-tel'} inputMode="tel" value={v.telefone} onChange={(e) => alterar({ telefone: soDigitos(e.target.value, 13) })} onFocus={(e) => e.target.select()} placeholder="DDD + número" className={campo} />
        </div>
      </div>
      {categorias.length > 0 && (
        <div className={FIELD_CLASS}>
          <label htmlFor="sp-cat" className={LABEL_CLASS}>Assunto</label>
          <select id="sp-cat" autoFocus={primeiroVazio === 'sp-cat'} value={v.categoria_id} onChange={(e) => alterar({ categoria_id: e.target.value })} className={`${campo} cursor-pointer`}>
            <option value="">Escolha...</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={FIELD_CLASS}>
        <label htmlFor="sp-desc" className={LABEL_CLASS}>Como podemos ajudar?</label>
        <textarea id="sp-desc" autoFocus={primeiroVazio === 'sp-desc'} value={v.descricao} onChange={(e) => alterar({ descricao: e.target.value })} rows={5} maxLength={4000} className={`${campo} resize-none`} />
      </div>
      {erro && <div className="p-2.5 rounded-lg bg-rose-50 text-rose-800 text-xs">{erro}</div>}
      <button type="submit" disabled={enviando} className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-50">
        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Iniciar atendimento
      </button>
    </form>
  );
};

const Conversa: React.FC<{ token: string; onNovo: (aviso?: string) => void }> = ({ token, onNovo }) => {
  const [c, setC] = useState<Chamado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [encerrando, setEncerrando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const qtd = useRef(0);
  /** Campo da mensagem: o foco volta para ele depois de enviar (fica desabilitado enquanto envia) */
  const campoMensagem = useRef<HTMLTextAreaElement>(null);
  /** Maior id de mensagem já visto (null = ainda não carregou): pedido de tela remota chegando depois tenta abrir o AnyDesk */
  const vistoAte = useRef<number | null>(null);
  const [tremer, setTremer] = useState(false);
  // O navegador só libera som depois do primeiro clique ou tecla na página
  useEffect(() => destravarSom(), []);
  const url = `/api/publico/suporte/chamado/${encodeURIComponent(token)}`;
  const onNovoRef = useRef(onNovo);
  onNovoRef.current = onNovo;

  const carregar = useCallback(() => {
    api(url)
      .then((d) => {
        setC(d);
        setErro(null);
      })
      .catch((e) => {
        // Token que não vale mais (chamado excluído): volta ao formulário
        if (/não encontrado/i.test(e.message)) onNovoRef.current();
        else setErro(e.message);
      });
  }, [url]);
  // Atualiza a cada 4 s (resposta da equipe, posição na fila)
  useEffect(() => {
    carregar();
    const i = setInterval(carregar, 4000);
    return () => clearInterval(i);
  }, [carregar]);
  // Cancelado, ou encerrado e já avaliado: não há mais nada aqui, vai direto para abrir um novo
  useEffect(() => {
    if (c?.status === 'cancelado') onNovoRef.current('Atendimento anterior cancelado.');
    else if (c?.status === 'encerrado' && c.avaliado) onNovoRef.current('Atendimento anterior encerrado. Obrigado pela avaliação!');
  }, [c?.status, c?.avaliado]);
  useEffect(() => {
    if (c && c.mensagens.length !== qtd.current) {
      qtd.current = c.mensagens.length;
      fim.current?.scrollIntoView({ block: 'end' });
    }
    if (!c) return;
    const maior = c.mensagens.reduce((m, x) => Math.max(m, x.id), 0);
    // Pedido de tela remota que chegou agora (com o chat aberto): tenta abrir o AnyDesk uma vez.
    // O navegador só deixa se o cliente mexeu no chat há poucos segundos; senão bloqueia e fica o cartão
    if (vistoAte.current !== null && c.mensagens.some((m) => m.texto === TELA_REMOTA && m.id > vistoAte.current!)) {
      // Num quadro invisível e temporário: sem o AnyDesk instalado, o erro fica nele e o chat continua na tela
      try {
        const q = document.createElement('iframe');
        q.style.display = 'none';
        q.src = 'anydesk://';
        document.body.appendChild(q);
        setTimeout(() => q.remove(), 3000);
      } catch {
        // bloqueado: o cliente usa o botão do cartão
      }
    }
    // Cutucão novo: campainha, o chat treme e o botão do widget no site pisca (se o painel estiver fechado)
    if (vistoAte.current !== null && c.mensagens.some((m) => m.texto === CUTUCAR && m.id > vistoAte.current!)) {
      tocarAviso('cutucar');
      setTremer(true);
      setTimeout(() => setTremer(false), 1000);
      try {
        window.parent.postMessage('crmweb-cutucar', '*');
      } catch {
        // página aberta fora do widget
      }
    }
    vistoAte.current = maior;
  }, [c]);

  if (!c) return <div className="flex-1 flex items-center justify-center">{erro ?? <Loader2 className="w-6 h-6 animate-spin text-stone-400" />}</div>;

  const encerrado = ['encerrado', 'cancelado'].includes(c.status);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    // Enter de novo enquanto envia: ignora (o campo fica só leitura, não desabilitado, para manter o foco)
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      await api(`${url}/mensagens`, { texto: texto.trim() });
      setTexto('');
      carregar();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
      setTimeout(() => campoMensagem.current?.focus(), 0);
    }
  };

  return (
    <>
      <div className="px-4 py-2 bg-white border-b border-stone-200 text-xs shrink-0 relative">
        {!encerrado && (
          <button
            type="button"
            onClick={() => setEncerrando(true)}
            className="absolute right-3 top-2 px-2.5 py-1 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 hover:text-rose-700 text-[11px] font-semibold cursor-pointer"
          >
            Encerrar
          </button>
        )}
        <div className={`font-semibold text-stone-800 truncate ${encerrado ? '' : 'pr-20'}`}>
          Atendimento nº {c.numero} • {c.titulo}
        </div>
        <div className="text-stone-500">
          {c.status === 'cancelado'
            ? 'Atendimento cancelado.'
            : encerrado
            ? 'Atendimento encerrado.'
            : c.posicao
              ? `Você é o ${c.posicao}º da fila. Um atendente já vai falar com você.`
              : c.status === 'pausado'
                ? `Atendimento em pausa${c.atendente ? ` com ${c.atendente}` : ''}. Já voltamos a falar com você.`
              : c.atendente
                ? `Em atendimento com ${c.atendente}.`
                : 'Aguardando um atendente.'}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 flex flex-col gap-2 ${tremer ? 'animate-tremer' : ''}`}>
        {c.mensagens.map((m, i) =>
          m.texto === CUTUCAR ? (
            <div key={m.id} className="self-center text-xs font-semibold text-amber-800 bg-amber-100 rounded-full px-3 py-1 inline-flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" /> {m.usuario_nome || 'O técnico'} está chamando a sua atenção • {formatDateTimeBR(m.criado_em)}
            </div>
          ) : m.texto === TELA_REMOTA ? (
            <CartaoTelaRemota
              key={m.id}
              tecnico={m.usuario_nome || 'O técnico'}
              quando={m.criado_em}
              ultimo={i === c.mensagens.length - 1}
              enviado={c.mensagens.some((x) => x.id > m.id && ID_ANYDESK.test(x.texto))}
              url={url}
              onEnviado={carregar}
            />
          ) : (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.autor === 'cliente' ? 'self-end bg-blue-600 text-white rounded-br-md' : 'self-start bg-white border border-stone-200 rounded-bl-md'
            }`}
          >
            {m.autor === 'equipe' && <div className="text-[10px] font-semibold text-blue-600 mb-0.5">{m.usuario_nome || 'Suporte'}</div>}
            {ID_ANYDESK.test(m.texto) ? `Número do AnyDesk enviado: ${formatarAnydesk(ID_ANYDESK.exec(m.texto)![1])}` : m.texto}
            <div className={`text-[10px] mt-0.5 text-right ${m.autor === 'cliente' ? 'text-blue-100' : 'text-stone-400'}`}>{formatDateTimeBR(m.criado_em)}</div>
          </div>
          ),
        )}
        {!c.mensagens.length && !encerrado && <p className="text-xs text-stone-500 text-center mt-4">Recebemos sua mensagem.<br />Se quiser, mande mais detalhes por aqui.</p>}
        <div ref={fim} />
      </div>

      {erro && <div className="mx-4 mb-2 p-2 rounded-lg bg-rose-50 text-rose-800 text-xs">{erro}</div>}

      {encerrando && (
        <ConfirmDialog
          titulo="Encerrar o atendimento?"
          mensagem={c.atendente ? 'A conversa termina e você poderá avaliar o atendimento.' : 'Você sai da fila e o pedido é cancelado.'}
          confirmar="Encerrar"
          onConfirmar={async () => {
            await api(`${url}/encerrar`, {});
            setEncerrando(false);
            carregar();
          }}
          onCancelar={() => setEncerrando(false)}
        />
      )}

      {encerrado ? (
        // Encerrado: avalia (cancelado e já avaliado vão direto para o formulário, no efeito acima)
        // Avaliação obrigatória: sem ela o cliente não abre um novo atendimento
        <Avaliar url={url} onFeito={carregar} />
      ) : (
        <form onSubmit={enviar} className="p-3 bg-white border-t border-stone-200 flex items-end gap-2 shrink-0">
          <textarea
            ref={campoMensagem}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
            readOnly={enviando}
            rows={1}
            maxLength={4000}
            placeholder={enviando ? 'Enviando...' : 'Escreva a sua mensagem'}
            aria-label="Mensagem"
            className={`${INPUT_CLASS} flex-1 resize-none text-sm`}
          />
          <button type="submit" disabled={enviando || !texto.trim()} title="Enviar" className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-40">
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      )}
    </>
  );
};

const Avaliar: React.FC<{ url: string; onFeito: () => void }> = ({ url, onFeito }) => {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="p-4 bg-white border-t border-stone-200 flex flex-col gap-2 shrink-0">
      <p className="text-sm font-semibold text-stone-800">Como foi o atendimento?</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setNota(n)} aria-label={`${n} estrela(s)`} className="p-1 cursor-pointer">
            <Star className={`w-7 h-7 ${n <= nota ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`} />
          </button>
        ))}
      </div>
      {nota > 0 && nota <= 3 && (
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={2000} placeholder="O que podemos melhorar?" aria-label="Comentário" className={`${INPUT_CLASS} w-full resize-none text-sm`} />
      )}
      {erro && <div className="p-2 rounded-lg bg-rose-50 text-rose-800 text-xs">{erro}</div>}
      <button
        type="button"
        disabled={!nota || enviando}
        onClick={async () => {
          setEnviando(true);
          try {
            await api(`${url}/avaliar`, { nota, comentario });
            onFeito();
          } catch (e: any) {
            setErro(e.message);
          } finally {
            setEnviando(false);
          }
        }}
        className="py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-40"
      >
        Enviar avaliação
      </button>
    </div>
  );
};
