import React, { useEffect, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { fetchConfig, salvarConfig } from '../services/api';
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { AvisoErro } from './AvisoErro';

interface Props {
  somenteLeitura: boolean;
  onToast: (msg: string) => void;
}

/**
 * Configurações › Prospecção: chave da Google Places API usada na tela Prospecção. Gravada
 * cifrada no servidor e nunca volta para a tela (server/prospeccao.ts).
 */
export const ConfigProspeccao: React.FC<Props> = ({ somenteLeitura, onToast }) => {
  const [estado, setEstado] = useState<{ chave_definida: boolean; chave_no_servidor: boolean } | null>(null);
  const [chave, setChave] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<{ chave_definida: boolean; chave_no_servidor: boolean }>('prospeccao', 'google')
      .then(({ valor }) => setEstado({ chave_definida: Boolean(valor?.chave_definida), chave_no_servidor: Boolean(valor?.chave_no_servidor) }))
      .catch((e) => setErro(e.message));
  }, []);

  if (!estado) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const gravar = async (valor: { chave?: string; limpar?: boolean }, aviso: string) => {
    setSalvando(true);
    setErro(null);
    try {
      await salvarConfig('prospeccao', 'google', valor);
      setEstado({ ...estado, chave_definida: !valor.limpar });
      setChave('');
      onToast(aviso);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form
      className="max-w-3xl flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (chave.trim()) gravar({ chave: chave.trim() }, 'Chave da Google Places API gravada.');
      }}
    >
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
      <div className={`${FIELD_CLASS} max-w-md`}>
        <label htmlFor="cfg-places-chave" className={LABEL_CLASS}>Chave da Google Places API</label>
        <input
          id="cfg-places-chave"
          type="password"
          autoComplete="off"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          disabled={somenteLeitura}
          placeholder={estado.chave_definida ? '•••••••• (gravada; digite para trocar)' : 'AIza...'}
          className={`${INPUT_CLASS} w-full`}
        />
        <span className={HINT_CLASS}>
          {estado.chave_definida
            ? 'Chave gravada.'
            : estado.chave_no_servidor
              ? 'Sem chave da empresa: a Prospecção usa a chave do servidor (GOOGLE_PLACES_API_KEY).'
              : 'Sem chave: a Prospecção não busca.'}{' '}
          No Google Cloud Console, ative a "Places API (New)", crie uma chave de API restrita a ela e configure o faturamento. O Google cobra por
          busca (os campos de telefone e avaliação são da faixa Enterprise).
        </span>
      </div>
      {!somenteLeitura && (
        <div className="flex gap-2">
          <button type="submit" disabled={salvando || !chave.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
          </button>
          {estado.chave_definida && (
            <button
              type="button"
              disabled={salvando}
              onClick={() => gravar({ limpar: true }, 'Chave da Google Places API apagada.')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Apagar chave
            </button>
          )}
        </div>
      )}
    </form>
  );
};
