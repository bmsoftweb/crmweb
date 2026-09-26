import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { buscarFotoInternet, enviarFotoProduto } from '../services/api';
import { INPUT_CLASS } from '../utils/formStyles';
import type { Id } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

const MAX_FOTOS = 4;
/** Lado maior da foto gravada (largura ou altura, proporcional) */
const LADO_MAX = 400;

/** Reduz a imagem para 400 px no lado maior (nunca amplia) e devolve JPEG com fundo branco */
async function reduzir(origem: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, falha) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error('O navegador não conseguiu abrir esta imagem.'));
    i.src = origem;
  });
  const fator = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * fator));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * fator));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // PNG transparente vira fundo branco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const lerArquivo = (arquivo: File) =>
  new Promise<string>((ok, falha) => {
    if (!arquivo.type.startsWith('image/')) return falha(new Error('Escolha um arquivo de imagem (JPEG, PNG, WebP…).'));
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(arquivo);
  });

/** Posição (1 a 4) da foto pelo nome do arquivo: produtos/<empresa>/<id>-<posição>.jpg */
const posicaoDe = (u: string) => Number(/-(\d+)\.jpg(\?|$)/.exec(u)?.[1]) || 0;

interface Props {
  id?: string;
  /** Produto já salvo (o arquivo leva o id dele); sem id, pede para salvar antes */
  produtoId?: Id | null;
  /** Endereços das fotos no Vercel Blob */
  value: unknown;
  onChange: (fotos: string[]) => void;
}

/**
 * Fotos do produto (até 4): do computador ou de um endereço da internet. Cada foto é reduzida
 * aqui (400 px no lado maior) e gravada no Vercel Blob; o cadastro guarda só os endereços.
 */
export const FotosField: React.FC<Props> = ({ id, produtoId, value, onChange }) => {
  const fotos: string[] = Array.isArray(value) ? value : typeof value === 'string' && value.startsWith('[') ? JSON.parse(value) : [];
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<number | null>(null);
  const cabe = fotos.length < MAX_FOTOS;
  // Fotos gravadas quando o formulário abriu: a posição delas só é reaproveitada se não houver outra
  // livre (a troca sobrescreve o arquivo, que o cadastro gravado ainda usa até salvar)
  const gravadas = useRef(fotos);
  const posicaoLivre = () => {
    const posicoes = [1, 2, 3, 4];
    const emUso = (lista: string[], n: number) => lista.some((u) => posicaoDe(u) === n);
    return posicoes.find((n) => !emUso(fotos, n) && !emUso(gravadas.current, n)) ?? posicoes.find((n) => !emUso(fotos, n)) ?? 0;
  };

  const incluir = async (obter: () => Promise<string>) => {
    setEnviando(true);
    setErro(null);
    try {
      if (!produtoId) throw new Error('Salve o produto antes de incluir fotos.');
      const { url } = await enviarFotoProduto(produtoId, posicaoLivre(), await reduzir(await obter()));
      onChange([...fotos, url]);
      return true;
    } catch (err: any) {
      setErro(err.message);
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const botao = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer w-fit';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {fotos.map((u, i) => (
          <div key={u.split('?')[0]} className="relative w-28 h-28 rounded-lg border border-stone-200 dark:border-stone-700 bg-white overflow-hidden group">
            <img src={u} alt={`Foto ${i + 1}`} className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={() => setRemovendo(i)}
              title="Remover a foto"
              className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-rose-600 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-rose-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {enviando && (
          <div className="w-28 h-28 rounded-lg border border-dashed border-stone-300 dark:border-stone-700 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
          </div>
        )}
      </div>

      {!produtoId && <span className="text-xs text-amber-700 dark:text-amber-400">Salve o produto para incluir fotos (o arquivo leva o código dele).</span>}

      {produtoId && cabe && !enviando && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className={botao}>
            <ImagePlus className="w-3.5 h-3.5" /> Do computador
            <input
              id={id}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = ''; // permite escolher o mesmo arquivo de novo
                if (arquivo) incluir(() => lerArquivo(arquivo));
              }}
            />
          </label>
          {link === null ? (
            <button type="button" onClick={() => setLink('')} className={botao}>
              <Globe className="w-3.5 h-3.5" /> Da internet
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-64">
              <input
                aria-label="Endereço da imagem"
                autoFocus
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (link.trim() && (await incluir(async () => (await buscarFotoInternet(link.trim())).imagem))) setLink(null);
                }}
                placeholder="https://... endereço da imagem"
                className={`${INPUT_CLASS} flex-1`}
              />
              <button
                type="button"
                disabled={!link.trim()}
                onClick={async () => {
                  if (await incluir(async () => (await buscarFotoInternet(link.trim())).imagem)) setLink(null);
                }}
                className={`${botao} disabled:opacity-40`}
              >
                Buscar
              </button>
              <button type="button" onClick={() => setLink(null)} className="text-xs font-semibold text-stone-500 hover:underline cursor-pointer">
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
      <span className="text-[11px] text-stone-400">
        {fotos.length}/{MAX_FOTOS} fotos. Cada uma é reduzida para 400 px no lado maior. Remover só vale depois de salvar.
      </span>
      {erro && <p className="text-[11px] text-rose-600">{erro}</p>}

      {removendo !== null &&
        createPortal(
          <ConfirmDialog
            titulo={`Remover a foto ${removendo + 1}?`}
            mensagem="A foto sai do cadastro (e do storage) depois de salvar o produto."
            confirmar="Remover"
            onConfirmar={() => {
              onChange(fotos.filter((_, j) => j !== removendo));
              setRemovendo(null);
            }}
            onCancelar={() => setRemovendo(null)}
          />,
          document.body,
        )}
    </div>
  );
};
