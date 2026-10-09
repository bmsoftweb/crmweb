import React, { useEffect, useRef, useState } from 'react';
import { Eraser, X } from 'lucide-react';
import { FIELD_CLASS, INPUT_CLASS_LG, LABEL_CLASS } from '../utils/formStyles';

interface Props {
  nomeInicial: string;
  documentoInicial: string;
  onConfirmar: (dados: { assinatura: string; assinatura_nome: string; assinatura_documento: string }) => void;
  onCancelar: () => void;
}

/** Tela cheia para o cliente assinar com o dedo; grava PNG (data URI) com quem assinou */
export const Assinatura: React.FC<Props> = ({ nomeInicial, documentoInicial, onConfirmar, onCancelar }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [nome, setNome] = useState(nomeInicial);
  const [documento, setDocumento] = useState(documentoInicial);
  const [vazia, setVazia] = useState(true);

  // Resolução real do canvas = tamanho na tela × densidade (traço nítido no celular)
  useEffect(() => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c1917';
  }, []);

  const ponto = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const comecar = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    const ctx = canvas.current!.getContext('2d')!;
    const [x, y] = ponto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setVazia(false);
  };

  const mover = (e: React.PointerEvent) => {
    if (!canvas.current!.hasPointerCapture(e.pointerId)) return;
    const ctx = canvas.current!.getContext('2d')!;
    const [x, y] = ponto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const limpar = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setVazia(true);
  };

  const pode = !vazia && nome.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-900">
      <div className="flex items-center justify-between border-b border-stone-200 p-3 dark:border-stone-700">
        <h2 className="text-base font-bold">Assinatura do cliente</h2>
        <button type="button" onClick={onCancelar} className="rounded-lg p-2 text-stone-500" title="Fechar sem gravar">
          <X size={22} />
        </button>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <div className={FIELD_CLASS}>
          <label htmlFor="ass-nome" className={LABEL_CLASS}>Nome de quem assina</label>
          <input id="ass-nome" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className={INPUT_CLASS_LG} autoFocus={!nome} />
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="ass-doc" className={LABEL_CLASS}>Documento (RG ou CPF)</label>
          <input id="ass-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={20} className={INPUT_CLASS_LG} inputMode="numeric" />
        </div>
      </div>
      <div className="relative mx-3 flex-1 rounded-xl border-2 border-dashed border-stone-300 bg-white">
        <canvas
          ref={canvas}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={comecar}
          onPointerMove={mover}
        />
        {vazia && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-400">Assine aqui com o dedo</span>}
        <div className="pointer-events-none absolute bottom-10 left-6 right-6 border-b border-stone-300" />
      </div>
      <div className="flex gap-3 p-3">
        <button type="button" onClick={limpar} className="flex items-center justify-center gap-2 rounded-xl bg-stone-100 px-4 py-3 font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">
          <Eraser size={18} /> Limpar
        </button>
        <button
          type="button"
          disabled={!pode}
          onClick={() => onConfirmar({ assinatura: canvas.current!.toDataURL('image/png'), assinatura_nome: nome.trim(), assinatura_documento: documento.trim() })}
          className="flex-1 rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-40"
        >
          {vazia ? 'Falta a assinatura' : !nome.trim() ? 'Falta o nome' : 'Confirmar assinatura'}
        </button>
      </div>
    </div>
  );
};
