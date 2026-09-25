import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { fetchConfig, salvarConfig } from '../services/api';
import { HINT_CLASS } from '../utils/formStyles';
import { Toggle } from './Toggle';
import { AvisoErro } from './AvisoErro';

interface Props {
  somenteLeitura: boolean;
  onToast: (msg: string) => void;
}

/** Configurações › Vendas: comportamentos do envio de propostas e pedidos */
export const ConfigVendas: React.FC<Props> = ({ somenteLeitura, onToast }) => {
  /** null = carregando; sem configuração gravada vale ligado */
  const [retorno, setRetorno] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<{ ativo?: boolean }>('vendas', 'retorno_envio')
      .then(({ valor }) => setRetorno(valor?.ativo !== false))
      .catch((e) => setErro(e.message));
  }, []);

  if (retorno === null) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfig('vendas', 'retorno_envio', { ativo: retorno });
      onToast('Configuração de vendas gravada.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}

      <div className="flex flex-col gap-1">
        <Toggle
          id="cfg-retorno-envio"
          checked={retorno}
          onChange={setRetorno}
          disabled={somenteLeitura}
          label={<span className="text-xs font-semibold text-stone-700 dark:text-stone-200">Criar tarefa de retorno ao enviar proposta ou pedido</span>}
        />
        <span className={HINT_CLASS}>
          Ao enviar por e-mail ou WhatsApp, cria a atividade &quot;Retorno Envio&quot; no negócio, para o próximo dia útil, lembrando de confirmar
          se o cliente recebeu.
        </span>
      </div>

      {!somenteLeitura && (
        <div>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar configuração
          </button>
        </div>
      )}
    </div>
  );
};
