import React, { useEffect, useState } from 'react';
import { Bot, Loader2, Save } from 'lucide-react';
import { fetchConfig, listRecords, salvarConfig, testarChatbot } from '../services/api';
import { OpcaoRef } from '../types';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { NumberField } from './NumberField';
import { AvisoErro } from './AvisoErro';

interface Chatbot {
  modelo: string;
  nome: string;
  minutos_devolver: number;
  /** Digitada agora; em branco mantém a gravada */
  chave: string;
  /** Modelos do Gemini que dá para escolher (vêm do servidor) */
  modelos: { value: string; label: string }[];
}

interface Props {
  somenteLeitura: boolean;
  onToast: (msg: string) => void;
}

/**
 * Configurações › Chatbot: a IA (Gemini) usada pela Automação (chave, modelo e nome do assistente),
 * o tempo para a conversa voltar ao bot, o revezamento de leads e a pesquisa de satisfação.
 * O atendimento em si (ligar, texto-base, menus) fica em Configurações › Automação.
 */
export const ConfigChatbot: React.FC<Props> = ({ somenteLeitura, onToast }) => {
  const [v, setV] = useState<Chatbot | null>(null);
  const [chaveGravada, setChaveGravada] = useState(false);
  const [usuarios, setUsuarios] = useState<OpcaoRef[]>([]);
  const [ocupado, setOcupado] = useState<'salvar' | 'testar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<any>('whatsapp', 'chatbot')
      .then(({ valor }) => {
        setV({ ...valor, chave: '' });
        setChaveGravada(Boolean(valor?.chave_definida));
      })
      .catch((e) => setErro(e.message));
    // Quem está no revezamento (ligado no cadastro de Usuários), só para mostrar
    listRecords('usuarios', { limit: 200, filters: [{ field: 'revezamento', op: 'eq', value: '1' }, { field: 'ativo', op: 'eq', value: '1' }] })
      .then((r) => setUsuarios(r.data.map((u) => ({ value: String(u.id), label: String(u.nome) }))))
      .catch(() => {});
  }, []);

  if (!v) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const alterar = (m: Partial<Chatbot>) => {
    setV({ ...v, ...m });
    setErro(null);
  };
  const campo = `${INPUT_CLASS} w-full`;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado('salvar');
    try {
      const { modelos, ...valor } = v;
      await salvarConfig('whatsapp', 'chatbot', valor);
      if (v.chave) setChaveGravada(true);
      setV({ ...v, chave: '' });
      onToast('Configuração do chatbot gravada.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setOcupado(null);
    }
  };

  const testar = async () => {
    setOcupado('testar');
    try {
      onToast((await testarChatbot()).mensagem);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <form onSubmit={salvar} className="max-w-3xl flex flex-col gap-4">
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}

      <p className="text-xs text-stone-600 dark:text-stone-300">
        A IA (Gemini) que a Automação usa nos nós de IA, com uma espera de 1 a 30 segundos e "digitando..." antes de responder. Ligar o atendimento, o
        texto-base e os menus ficam em Configurações › Automação. Na tela Conversas dá para assumir ou devolver cada conversa ao bot.
      </p>

      <fieldset disabled={somenteLeitura} className="flex flex-col gap-4">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={FIELD_CLASS}>
            <label htmlFor="bot-chave" className={LABEL_CLASS}>Chave do Gemini</label>
            <input
              id="bot-chave"
              type="password"
              value={v.chave}
              onChange={(e) => alterar({ chave: e.target.value })}
              maxLength={500}
              autoComplete="new-password"
              required={!chaveGravada}
              placeholder={chaveGravada ? 'Gravada — deixe em branco para manter' : 'Google AI Studio › Get API key'}
              className={campo}
            />
            <span className={HINT_CLASS}>Gravada cifrada; não é exibida de volta</span>
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="bot-modelo" className={LABEL_CLASS}>Modelo</label>
            <select id="bot-modelo" value={v.modelo} onChange={(e) => alterar({ modelo: e.target.value })} required className={`${campo} cursor-pointer`}>
              {v.modelos.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className={HINT_CLASS}>Flash: respostas melhores. Flash-Lite: mais rápido e mais barato.</span>
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="bot-nome" className={LABEL_CLASS}>Nome do assistente</label>
            <input id="bot-nome" value={v.nome} onChange={(e) => alterar({ nome: e.target.value })} onFocus={(e) => e.target.select()} maxLength={60} required className={campo} />
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="bot-minutos" className={LABEL_CLASS}>Devolver ao bot depois de (minutos)</label>
            <NumberField id="bot-minutos" value={String(v.minutos_devolver)} onChange={(t) => alterar({ minutos_devolver: Number(t) || 0 })} scale={0} className={campo} />
            <span className={HINT_CLASS}>Conversa com humano volta ao bot após esse tempo sem mensagem de atendente</span>
          </div>
        </div>

        <div className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Revezamento de leads</span>
          {usuarios.length ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {usuarios.map((u) => (
                <span key={u.value} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {u.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-300">
              Ninguém no revezamento: os leads novos ficam sem responsável até alguém assumir.
            </div>
          )}
          <span className={HINT_CLASS}>Cada lead novo vai para o próximo da lista. Para incluir ou tirar alguém: Usuários › "Entra no revezamento de leads".</span>
        </div>

      </fieldset>

      {!somenteLeitura && (
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={ocupado !== null}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
          >
            {ocupado === 'salvar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar configuração
          </button>
          <button
            type="button"
            onClick={testar}
            disabled={ocupado !== null || !chaveGravada}
            title={chaveGravada ? 'Faz uma pergunta curta ao Gemini com a chave e o modelo gravados' : 'Grave a chave antes'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-50"
          >
            {ocupado === 'testar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            Testar Gemini
          </button>
        </div>
      )}
    </form>
  );
};
