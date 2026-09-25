import React, { useEffect, useState } from 'react';
import { Loader2, PlugZap, Save } from 'lucide-react';
import { fetchConfig, salvarConfig, testarSmtp } from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import { AvisoErro } from './AvisoErro';

interface Smtp {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  from: string;
  /** Digitada agora; em branco mantém a gravada */
  senha: string;
}

const VAZIO: Smtp = { host: '', port: '587', secure: false, user: '', from: '', senha: '' };

interface Props {
  somenteLeitura: boolean;
  onToast: (msg: string) => void;
}

/**
 * Configurações › E-mail: servidor SMTP da empresa, usado no envio de propostas.
 * A senha é gravada cifrada no servidor e nunca volta para a tela: só se sabe se existe.
 */
export const ConfigEmail: React.FC<Props> = ({ somenteLeitura, onToast }) => {
  const [v, setV] = useState<Smtp | null>(null);
  const [senhaDefinida, setSenhaDefinida] = useState(false);
  const [ocupado, setOcupado] = useState<'salvar' | 'testar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<any>('email', 'smtp')
      .then(({ valor }) => {
        setV(valor ? { host: valor.host, port: String(valor.port), secure: Boolean(valor.secure), user: valor.user || '', from: valor.from || '', senha: '' } : VAZIO);
        setSenhaDefinida(Boolean(valor?.senha_definida));
      })
      .catch((e) => setErro(e.message));
  }, []);

  if (!v) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const alterar = (m: Partial<Smtp>) => {
    setV({ ...v, ...m });
    setErro(null);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado('salvar');
    try {
      await salvarConfig('email', 'smtp', { ...v, port: Number(v.port) });
      if (v.senha) setSenhaDefinida(true);
      setV({ ...v, senha: '' });
      onToast(v.host ? 'Configuração de e-mail gravada.' : 'Configuração de e-mail removida: vale a do servidor (.env).');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setOcupado(null);
    }
  };

  const testar = async () => {
    setOcupado('testar');
    try {
      await testarSmtp();
      onToast('Conexão com o servidor de e-mail OK: usuário e senha aceitos.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setOcupado(null);
    }
  };

  const campo = `${INPUT_CLASS} w-full`;

  return (
    <form onSubmit={salvar} className="max-w-3xl flex flex-col gap-4">
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}

      <fieldset disabled={somenteLeitura} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className={`${FIELD_CLASS} sm:col-span-2`}>
          <label htmlFor="smtp-host" className={LABEL_CLASS}>Servidor SMTP</label>
          <input id="smtp-host" value={v.host} onChange={(e) => alterar({ host: e.target.value })} maxLength={255} placeholder="email-ssl.com.br" className={campo} />
          <span className={HINT_CLASS}>Em branco: usa a configuração do servidor (.env)</span>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="smtp-port" className={LABEL_CLASS}>Porta</label>
          <NumberField id="smtp-port" value={v.port} onChange={(p) => alterar({ port: p })} scale={0} required={Boolean(v.host)} className={campo} />
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="smtp-secure" className={LABEL_CLASS}>SSL/TLS direto</label>
          <div className="h-full flex items-center">
            <Toggle id="smtp-secure" checked={v.secure} onChange={(s) => alterar({ secure: s })} title="Ligado na porta 465; desligado na 587 (STARTTLS)" />
          </div>
        </div>

        <div className={`${FIELD_CLASS} sm:col-span-2`}>
          <label htmlFor="smtp-user" className={LABEL_CLASS}>Usuário (conta de e-mail)</label>
          <input id="smtp-user" value={v.user} onChange={(e) => alterar({ user: e.target.value })} maxLength={255} required={Boolean(v.host)} autoComplete="off" placeholder="vendas@suaempresa.com.br" className={campo} />
        </div>
        <div className={`${FIELD_CLASS} sm:col-span-2`}>
          <label htmlFor="smtp-senha" className={LABEL_CLASS}>Senha</label>
          <input
            id="smtp-senha"
            type="password"
            value={v.senha}
            onChange={(e) => alterar({ senha: e.target.value })}
            maxLength={200}
            autoComplete="new-password"
            required={Boolean(v.host) && !senhaDefinida}
            placeholder={senhaDefinida ? 'Gravada — deixe em branco para manter' : 'Senha da conta de e-mail'}
            className={campo}
          />
          <span className={HINT_CLASS}>Gravada cifrada; não é exibida de volta</span>
        </div>

        <div className={`${FIELD_CLASS} sm:col-span-4`}>
          <label htmlFor="smtp-from" className={LABEL_CLASS}>Remetente</label>
          <input id="smtp-from" value={v.from} onChange={(e) => alterar({ from: e.target.value })} maxLength={255} placeholder="BMsoft Sistemas <vendas@suaempresa.com.br>" className={campo} />
          <span className={HINT_CLASS}>Em branco: o próprio usuário. Muitos provedores (ex.: Locaweb) exigem o mesmo e-mail do usuário.</span>
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
            disabled={ocupado !== null}
            title="Conecta e faz login com a configuração gravada, sem enviar e-mail"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-50"
          >
            {ocupado === 'testar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            Testar conexão
          </button>
        </div>
      )}
    </form>
  );
};
