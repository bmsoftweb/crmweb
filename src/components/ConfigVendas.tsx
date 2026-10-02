import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { fetchConfig, fetchOptions, salvarConfig } from '../services/api';
import { OpcaoRef } from '../types';
import { SelectBusca } from './SelectBusca';
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
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
  /** Departamento das mensagens privadas do envio por WhatsApp ('' = o de quem envia) */
  const [depPrivado, setDepPrivado] = useState('');
  const [departamentos, setDepartamentos] = useState<OpcaoRef[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<{ ativo?: boolean }>('vendas', 'retorno_envio')
      .then(({ valor }) => setRetorno(valor?.ativo !== false))
      .catch((e) => setErro(e.message));
    fetchConfig<{ departamento_id?: number | null }>('vendas', 'privacidade_envio')
      .then(({ valor }) => setDepPrivado(valor?.departamento_id ? String(valor.departamento_id) : ''))
      .catch(() => {});
    fetchOptions('departamentos', 'nome').then(setDepartamentos).catch(() => {});
  }, []);

  if (retorno === null) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfig('vendas', 'retorno_envio', { ativo: retorno });
      await salvarConfig('vendas', 'privacidade_envio', { departamento_id: depPrivado ? Number(depPrivado) : null });
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

      <div className={`${FIELD_CLASS} max-w-sm`}>
        <label htmlFor="cfg-dep-privado" className={LABEL_CLASS}>Departamento das propostas no WhatsApp</label>
        <SelectBusca
          id="cfg-dep-privado"
          value={depPrivado}
          options={departamentos}
          onChange={setDepPrivado}
          disabled={somenteLeitura}
          vazioLabel="— O de quem envia —"
          className={`${INPUT_CLASS} w-full`}
        />
        <span className={HINT_CLASS}>
          A proposta e o pedido enviados pelo WhatsApp (mensagem, PDF e anexos) ficam privados deste departamento: só ele e o administrador
          veem o conteúdo na conversa.
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
