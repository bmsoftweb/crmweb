import React, { useEffect, useState } from 'react';
import { Loader2, Save, Star } from 'lucide-react';
import { fetchConfig, salvarConfig } from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import { AvisoErro } from './AvisoErro';

interface Pesquisa {
  ativo: boolean;
  pergunta: string;
  comentario: string;
  agradecimento: string;
  minutos: number;
  /** Opções de 1 a 5 (fixas, vêm do servidor) */
  opcoes: string;
}

interface Props {
  somenteLeitura: boolean;
  onToast: (msg: string) => void;
}

/**
 * Configurações › Chatbot › Pesquisa de satisfação: sai ao Encerrar um atendimento da equipe e no fim
 * da jornada; nota de 1 a 5 e, para nota baixa, um comentário (server/pesquisa.ts)
 */
export const ConfigPesquisa: React.FC<Props> = ({ somenteLeitura, onToast }) => {
  const [v, setV] = useState<Pesquisa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<Pesquisa>('whatsapp', 'pesquisa')
      .then(({ valor }) => setV(valor))
      .catch((e) => setErro(e.message));
  }, []);

  if (!v) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const alterar = (m: Partial<Pesquisa>) => setV({ ...v, ...m });
  const campo = `${INPUT_CLASS} w-full resize-y`;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const { opcoes, ...valor } = v;
      await salvarConfig('whatsapp', 'pesquisa', valor);
      onToast(v.ativo ? 'Pesquisa de satisfação gravada e ligada.' : 'Pesquisa de satisfação gravada (desligada).');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={salvar} className="max-w-3xl flex flex-col gap-4 mt-8 pt-6 border-t border-stone-200 dark:border-stone-800">
      <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-500" />
        Pesquisa de satisfação
      </h3>
      <p className="text-xs text-stone-600 dark:text-stone-300">
        Enviada quando alguém da equipe clica em Encerrar numa conversa que atendeu, e quando o cliente chega ao fim da jornada. O cliente responde de 1 a 5 (número
        ou estrelas); nota de 1 a 3 pede um comentário. Se ele responder outra coisa, a pesquisa é descartada e o atendimento segue normal. Resultados em Vendas ›
        Avaliações e no Painel de Vendas.
      </p>
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}

      <fieldset disabled={somenteLeitura} className="flex flex-col gap-4">
        <Toggle checked={v.ativo} onChange={(ativo) => alterar({ ativo })} label={<span className="text-xs font-semibold text-stone-700 dark:text-stone-200">Pesquisa ligada</span>} />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4">
          <div className="flex flex-col gap-4">
            <div className={FIELD_CLASS}>
              <label htmlFor="pesq-pergunta" className={LABEL_CLASS}>Pergunta</label>
              <textarea id="pesq-pergunta" value={v.pergunta} onChange={(e) => alterar({ pergunta: e.target.value })} rows={2} maxLength={1000} className={campo} />
              <span className={HINT_CLASS}>{'{{atendente}}'} = quem atendeu (no fim da jornada, o nome do bot). As opções de 1 a 5 vão embaixo.</span>
            </div>
            <div className={FIELD_CLASS}>
              <label htmlFor="pesq-comentario" className={LABEL_CLASS}>Pedido de comentário (nota de 1 a 3)</label>
              <textarea id="pesq-comentario" value={v.comentario} onChange={(e) => alterar({ comentario: e.target.value })} rows={2} maxLength={1000} className={campo} />
            </div>
            <div className={FIELD_CLASS}>
              <label htmlFor="pesq-obrigado" className={LABEL_CLASS}>Agradecimento</label>
              <textarea id="pesq-obrigado" value={v.agradecimento} onChange={(e) => alterar({ agradecimento: e.target.value })} rows={2} maxLength={1000} className={campo} />
            </div>
            <div className={`${FIELD_CLASS} sm:w-1/2`}>
              <label htmlFor="pesq-minutos" className={LABEL_CLASS}>Vence sem resposta depois de (minutos)</label>
              <NumberField id="pesq-minutos" value={String(v.minutos)} onChange={(t) => alterar({ minutos: Number(t) || 0 })} scale={0} className={`${INPUT_CLASS} w-full`} />
              <span className={HINT_CLASS}>1.440 minutos = 24 horas</span>
            </div>
          </div>
          <div className="self-start rounded-2xl rounded-bl-md px-3 py-2 bg-white dark:bg-stone-800 shadow-xs border border-stone-200 dark:border-stone-700 text-[13px] leading-snug text-stone-800 dark:text-stone-100 whitespace-pre-wrap">
            <div className="text-[10px] font-semibold text-stone-400 mb-1">Como o cliente vê</div>
            {`${v.pergunta.replace(/\{\{\s*atendente\s*\}\}/g, 'Luis')}\n${v.opcoes}`}
          </div>
        </div>
      </fieldset>

      {!somenteLeitura && (
        <button
          type="submit"
          disabled={salvando}
          className="self-start flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar pesquisa
        </button>
      )}
    </form>
  );
};
