import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Bot, Loader2, Save } from 'lucide-react';
import { fetchConfig, fetchOptions, salvarConfig, testarChatbot } from '../services/api';
import { OpcaoRef } from '../types';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import { AvisoErro } from './AvisoErro';

interface Chatbot {
  ativo: boolean;
  modelo: string;
  nome: string;
  texto_base: string;
  minutos_devolver: number;
  vendedores: number[];
  /** Menu de departamentos: abertura e opções, na ordem (vazio = sem menu) */
  menu_texto: string;
  menu: { departamento_id: number; bot: boolean }[];
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
 * Configurações › Chatbot: IA (Gemini) que responde o WhatsApp da empresa, cadastra leads para os
 * vendedores (revezamento) e passa a conversa para um humano quando precisa.
 */
export const ConfigChatbot: React.FC<Props> = ({ somenteLeitura, onToast }) => {
  const [v, setV] = useState<Chatbot | null>(null);
  const [chaveGravada, setChaveGravada] = useState(false);
  const [usuarios, setUsuarios] = useState<OpcaoRef[]>([]);
  const [departamentos, setDepartamentos] = useState<OpcaoRef[]>([]);
  const [ocupado, setOcupado] = useState<'salvar' | 'testar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<any>('whatsapp', 'chatbot')
      .then(({ valor }) => {
        setV({ ...valor, chave: '' });
        setChaveGravada(Boolean(valor?.chave_definida));
      })
      .catch((e) => setErro(e.message));
    fetchOptions('usuarios', 'nome')
      .then(setUsuarios)
      .catch(() => {}); // sem a lista, o revezamento vale para todos os vendedores
    fetchOptions('departamentos', 'nome')
      .then(setDepartamentos)
      .catch(() => {});
  }, []);

  if (!v) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const alterar = (m: Partial<Chatbot>) => {
    setV({ ...v, ...m });
    setErro(null);
  };
  const campo = `${INPUT_CLASS} w-full`;

  // Menu: os escolhidos na ordem gravada, depois os demais departamentos
  const menu = v.menu ?? [];
  const nomeDep = (id: number) => departamentos.find((d) => Number(d.value) === id)?.label ?? `Departamento ${id}`;
  const foraDoMenu = departamentos.filter((d) => !menu.some((m) => m.departamento_id === Number(d.value)));
  const mover = (i: number, passo: number) => {
    const novo = [...menu];
    [novo[i], novo[i + passo]] = [novo[i + passo], novo[i]];
    alterar({ menu: novo });
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado('salvar');
    try {
      const { modelos, ...valor } = v;
      await salvarConfig('whatsapp', 'chatbot', valor);
      if (v.chave) setChaveGravada(true);
      setV({ ...v, chave: '' });
      onToast(v.ativo ? 'Chatbot gravado e ligado.' : 'Chatbot gravado (desligado).');
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
        Responde as mensagens do WhatsApp da empresa com IA (Gemini), o tempo todo, com uma espera de 1 a 30 segundos e "digitando...". Cadastra quem ainda
        não é cliente como lead, com um negócio para o próximo vendedor do revezamento, e passa a conversa para um humano quando o cliente pede ou quando o bot
        não sabe responder. Na tela Conversas dá para assumir ou devolver cada conversa ao bot.
      </p>

      <fieldset disabled={somenteLeitura} className="flex flex-col gap-4">
        <Toggle checked={v.ativo} onChange={(ativo) => alterar({ ativo })} label={<span className="text-xs font-semibold text-stone-700 dark:text-stone-200">Chatbot ligado</span>} />

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
          <label htmlFor="bot-texto" className={LABEL_CLASS}>Texto-base da empresa</label>
          <textarea
            id="bot-texto"
            value={v.texto_base}
            onChange={(e) => alterar({ texto_base: e.target.value })}
            rows={12}
            maxLength={50000}
            placeholder={'O que o bot pode responder: o que a empresa faz, produtos e serviços, preços que podem ser informados, horário de atendimento, endereço, formas de pagamento, prazos, políticas, perguntas frequentes...'}
            className={`${campo} resize-y`}
          />
          <span className={HINT_CLASS}>O bot responde só com o que está aqui e com os dados do cliente no CRM; o que não souber, passa para um humano.</span>
        </div>

        <div className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Vendedores do revezamento</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {usuarios.map((u) => {
              const id = Number(u.value);
              return (
                <Toggle
                  key={u.value}
                  size="sm"
                  checked={v.vendedores.includes(id)}
                  onChange={(sim) => alterar({ vendedores: sim ? [...v.vendedores, id] : v.vendedores.filter((x) => x !== id) })}
                  label={u.label}
                />
              );
            })}
          </div>
          <span className={HINT_CLASS}>Nenhum marcado: entram todos os usuários com perfil Vendedor ativos. Cada lead novo vai para o próximo da lista.</span>
        </div>

        <div className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Menu de departamentos</span>
          <p className="text-xs text-stone-600 dark:text-stone-300">
            Na primeira mensagem, o bot manda o menu e o cliente escolhe o departamento (pelo número ou escrevendo). "Bot continua" ligado: a IA segue atendendo
            sobre o assunto; desligado: a conversa passa direto para quem é do departamento, que recebe uma atividade e um aviso no WhatsApp. Nenhum departamento
            no menu: o bot atende sem menu.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-4 pt-1">
            <div className="flex flex-col gap-2">
              <textarea
                aria-label="Texto de abertura do menu"
                value={v.menu_texto}
                onChange={(e) => alterar({ menu_texto: e.target.value })}
                rows={2}
                maxLength={500}
                className={`${campo} resize-y`}
              />
              {menu.map((m, i) => (
                <div key={m.departamento_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-800/60">
                  <span className="w-5 text-xs font-bold text-stone-500">{i + 1}</span>
                  <span className="flex-1 min-w-[6rem] truncate text-xs font-semibold text-stone-800 dark:text-stone-100">{nomeDep(m.departamento_id)}</span>
                  <Toggle
                    size="sm"
                    checked={m.bot}
                    onChange={(bot) => alterar({ menu: menu.map((x, j) => (j === i ? { ...x, bot } : x)) })}
                    label="Bot continua"
                  />
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} title="Subir" className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30 cursor-pointer">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === menu.length - 1} title="Descer" className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30 cursor-pointer">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <Toggle size="sm" checked onChange={() => alterar({ menu: menu.filter((_, j) => j !== i) })} label="No menu" />
                </div>
              ))}
              {foraDoMenu.map((d) => (
                <div key={d.value} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-dashed border-stone-200 dark:border-stone-700">
                  <span className="w-5" />
                  <span className="flex-1 min-w-0 truncate text-xs text-stone-500 dark:text-stone-400">{d.label}</span>
                  <Toggle
                    size="sm"
                    checked={false}
                    onChange={() => alterar({ menu: [...menu, { departamento_id: Number(d.value), bot: false }] })}
                    label="No menu"
                  />
                </div>
              ))}
              {!departamentos.length && <span className={HINT_CLASS}>Nenhum departamento: cadastre em Cadastros › Departamentos.</span>}
            </div>
            {menu.length > 0 && (
              <div className="self-start rounded-2xl rounded-bl-md px-3 py-2 bg-white dark:bg-stone-800 shadow-xs border border-stone-200 dark:border-stone-700 text-[13px] leading-snug text-stone-800 dark:text-stone-100 whitespace-pre-wrap">
                <div className="text-[10px] font-semibold text-stone-400 mb-1">Como o cliente vê</div>
                {`${v.menu_texto}\n${menu.map((m, i) => `${i + 1} - ${nomeDep(m.departamento_id)}`).join('\n')}`}
              </div>
            )}
          </div>
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
