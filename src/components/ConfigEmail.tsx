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
  /** Leitura das respostas (pesquisa de satisfação por e-mail), com o mesmo usuário e senha */
  imap_host: string;
  imap_port: string;
}

const VAZIO: Smtp = { host: '', port: '587', secure: false, user: '', from: '', senha: '', imap_host: '', imap_port: '993' };

interface Props {
  /** smtp = conta comercial; smtp_suporte = conta do suporte (em branco: usa a comercial) */
  chave?: 'smtp' | 'smtp_suporte';
  somenteLeitura: boolean;
  onToast: (msg: string) => void;
}

/**
 * Configurações › E-mail: servidor SMTP da empresa, usado no envio de propostas; IMAP para ler as respostas da pesquisa de satisfação.
 * A senha é gravada cifrada no servidor e nunca volta para a tela: só se sabe se existe.
 */
export const ConfigEmail: React.FC<Props> = ({ chave = 'smtp', somenteLeitura, onToast }) => {
  const suporte = chave === 'smtp_suporte';
  /** Prefixo dos ids: as duas contas ficam na mesma tela */
  const id = (campo: string) => `${chave}-${campo}`;
  const [v, setV] = useState<Smtp | null>(null);
  const [senhaDefinida, setSenhaDefinida] = useState(false);
  const [ocupado, setOcupado] = useState<'salvar' | 'testar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<any>('email', chave)
      .then(({ valor }) => {
        setV(
          valor
            ? { host: valor.host, port: String(valor.port), secure: Boolean(valor.secure), user: valor.user || '', from: valor.from || '', senha: '', imap_host: valor.imap_host || '', imap_port: String(valor.imap_port || 993) }
            : VAZIO,
        );
        setSenhaDefinida(Boolean(valor?.senha_definida));
      })
      .catch((e) => setErro(e.message));
  }, [chave]);

  if (!v) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const alterar = (m: Partial<Smtp>) => {
    setV({ ...v, ...m });
    setErro(null);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado('salvar');
    try {
      await salvarConfig('email', chave, { ...v, port: Number(v.port), imap_port: Number(v.imap_port) || 993 });
      if (v.senha) setSenhaDefinida(true);
      setV({ ...v, senha: '' });
      onToast(v.host ? `E-mail ${suporte ? 'do suporte' : 'comercial'} gravado.` : suporte ? 'E-mail do suporte removido: vale o comercial.' : 'Configuração de e-mail removida: vale a do servidor (.env).');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setOcupado(null);
    }
  };

  const testar = async () => {
    setOcupado('testar');
    try {
      await testarSmtp(suporte ? 'smtp_suporte' : 'smtp');
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
          <label htmlFor={id('smtp-host')} className={LABEL_CLASS}>Servidor SMTP</label>
          <input id={id('smtp-host')} value={v.host} onChange={(e) => alterar({ host: e.target.value })} maxLength={255} placeholder="email-ssl.com.br" className={campo} />
          <span className={HINT_CLASS}>{suporte ? 'Em branco: o suporte usa o e-mail comercial' : 'Em branco: usa a configuração do servidor (.env)'}</span>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor={id('smtp-port')} className={LABEL_CLASS}>Porta</label>
          <NumberField id={id('smtp-port')} value={v.port} onChange={(p) => alterar({ port: p })} scale={0} required={Boolean(v.host)} className={campo} />
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor={id('smtp-secure')} className={LABEL_CLASS}>SSL/TLS direto</label>
          <div className="h-full flex items-center">
            <Toggle id={id('smtp-secure')} checked={v.secure} onChange={(s) => alterar({ secure: s })} title="Ligado na porta 465; desligado na 587 (STARTTLS)" />
          </div>
        </div>

        <div className={`${FIELD_CLASS} sm:col-span-2`}>
          <label htmlFor={id('smtp-user')} className={LABEL_CLASS}>Usuário (conta de e-mail)</label>
          <input id={id('smtp-user')} value={v.user} onChange={(e) => alterar({ user: e.target.value })} maxLength={255} required={Boolean(v.host)} autoComplete="off" placeholder="vendas@suaempresa.com.br" className={campo} />
        </div>
        <div className={`${FIELD_CLASS} sm:col-span-2`}>
          <label htmlFor={id('smtp-senha')} className={LABEL_CLASS}>Senha</label>
          <input
            id={id('smtp-senha')}
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
          <label htmlFor={id('smtp-from')} className={LABEL_CLASS}>Remetente</label>
          <input id={id('smtp-from')} value={v.from} onChange={(e) => alterar({ from: e.target.value })} maxLength={255} placeholder="BMsoft Sistemas <vendas@suaempresa.com.br>" className={campo} />
          <span className={HINT_CLASS}>Em branco: o próprio usuário. Muitos provedores (ex.: Locaweb) exigem o mesmo e-mail do usuário.</span>
        </div>

        <div className={`${FIELD_CLASS} sm:col-span-3`}>
          <label htmlFor={id('imap-host')} className={LABEL_CLASS}>Servidor IMAP (leitura das respostas)</label>
          <input id={id('imap-host')} value={v.imap_host} onChange={(e) => alterar({ imap_host: e.target.value })} onFocus={(e) => e.target.select()} maxLength={255} placeholder="imap.suaempresa.com.br" className={campo} />
          <span className={HINT_CLASS}>Para ler as respostas da pesquisa de satisfação por e-mail, com o mesmo usuário e senha. Em branco: o e-mail só envia.</span>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor={id('imap-port')} className={LABEL_CLASS}>Porta IMAP</label>
          <NumberField id={id('imap-port')} value={v.imap_port} onChange={(p) => alterar({ imap_port: p })} scale={0} className={campo} />
          <span className={HINT_CLASS}>993 (SSL)</span>
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
