import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { fetchConfig, salvarConfig } from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS, HINT_CLASS } from '../utils/formStyles';
import { TIPOS_ATIVIDADE } from '../utils/crm';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import { AvisoErro } from './AvisoErro';

type Evento = 'atividade' | 'proposta' | 'pedido' | 'contrato' | 'assinatura';
/** Textos têm as variáveis do evento; o lembrete para o vendedor tem as dele */
type EventoTexto = Evento | 'atividade_vendedor';

interface Config {
  atividade: { ativo: boolean; horas: number; tipos: string[]; texto: string; texto_vendedor: string };
  proposta: { ativo: boolean; dias: number; texto: string };
  pedido: { ativo: boolean; aprovado: string; faturado: string };
  contrato: { ativo: boolean; dias: number; texto: string };
  assinatura: { ativo: boolean; dias: number; texto: string };
  /** Variáveis aceitas em cada evento (vêm do servidor, não são gravadas) */
  variaveis: Record<EventoTexto, string[]>;
}

interface Props {
  somenteLeitura: boolean;
  onToast: (msg: string) => void;
}

const campo = `${INPUT_CLASS} w-full`;

/**
 * Configurações › Mensagens automáticas: WhatsApp para o cliente disparado por eventos do CRM.
 * Saem das 8h às 20h, pelo número configurado na aba WhatsApp, e cada aviso sai uma vez só.
 */
export const ConfigAutomaticas: React.FC<Props> = ({ somenteLeitura, onToast }) => {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig<Config>('whatsapp', 'automaticas')
      .then(({ valor }) => setCfg(valor))
      .catch((e) => setErro(e.message));
  }, []);

  if (!cfg) return erro ? <AvisoErro mensagem={erro} onFechar={() => setErro(null)} /> : <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  const alterar = <E extends Evento>(evento: E, m: Partial<Config[E]>) => {
    setCfg({ ...cfg, [evento]: { ...cfg[evento], ...m } });
    setErro(null);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const { variaveis, ...valor } = cfg;
      await salvarConfig('whatsapp', 'automaticas', valor);
      onToast('Mensagens automáticas gravadas.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  /** Texto com as variáveis do evento; clicar numa variável a acrescenta no fim */
  const Texto = ({ evento, id, rotulo, valor, onChange, dica }: { evento: EventoTexto; id: string; rotulo: string; valor: string; onChange: (t: string) => void; dica?: string }) => (
    <div className={FIELD_CLASS}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {rotulo}
      </label>
      <textarea id={id} value={valor} onChange={(e) => onChange(e.target.value)} maxLength={1000} rows={3} disabled={somenteLeitura} className={`${campo} resize-y`} />
      <div className="flex flex-wrap items-center gap-1">
        {dica && <span className={`${HINT_CLASS} mr-1`}>{dica}</span>}
        {cfg.variaveis[evento].map((v) => (
          <button
            key={v}
            type="button"
            disabled={somenteLeitura}
            onClick={() => onChange(`${valor}${valor && !valor.endsWith(' ') ? ' ' : ''}{{${v}}}`)}
            title="Acrescentar ao texto"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300 cursor-pointer disabled:cursor-default"
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
    </div>
  );

  const Cartao = ({ evento, titulo, descricao, children }: { evento: Evento; titulo: string; descricao: string; children: React.ReactNode }) => (
    <section className="p-4 rounded-lg border border-stone-200 dark:border-stone-800 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">{titulo}</h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{descricao}</p>
        </div>
        <Toggle id={`auto-${evento}`} checked={cfg[evento].ativo} onChange={(ativo) => alterar(evento, { ativo } as any)} disabled={somenteLeitura} label={cfg[evento].ativo ? 'Ligado' : 'Desligado'} />
      </div>
      {children}
    </section>
  );

  const Numero = ({ id, rotulo, valor, onChange, dica }: { id: string; rotulo: string; valor: number; onChange: (n: number) => void; dica: string }) => (
    <div className={`${FIELD_CLASS} w-40`}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {rotulo}
      </label>
      <NumberField id={id} value={String(valor)} onChange={(t) => onChange(Number(t) || 0)} scale={0} disabled={somenteLeitura} className={campo} />
      <span className={HINT_CLASS}>{dica}</span>
    </div>
  );

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}

      <p className="text-xs text-stone-600 dark:text-stone-300">
        Enviadas pelo número da aba <b>WhatsApp</b>, só das <b>8h às 20h</b>, com o mesmo intervalo das campanhas. Cada aviso sai uma vez só e aparece em
        Conversas. Pessoas sem telefone com DDD não recebem.
      </p>

      {/* Os campos são chamados como função (não como componente) para o React não recriá-los a cada tecla */}
      {Cartao({
        evento: 'atividade',
        titulo: 'Lembrete de atividade',
        descricao:
          'Avisa antes da atividade (é preciso ter hora). Cada atividade escolhe no campo "Lembrete para" quem recebe: o cliente, o vendedor (responsável do negócio, com WhatsApp no cadastro de usuários), os dois ou ninguém. Remarcada, vai um lembrete novo.',
        children: (
          <>
            <div className="flex flex-wrap gap-6">
              {Numero({ id: 'auto-atividade-horas', rotulo: 'Horas antes', valor: cfg.atividade.horas, onChange: (horas) => alterar('atividade', { horas }), dica: 'De 1 a 72' })}
              <div className={FIELD_CLASS}>
                <span className={LABEL_CLASS}>Tipos de atividade</span>
                <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                  {TIPOS_ATIVIDADE.map((t) => (
                    <Toggle
                      key={t.value}
                      size="sm"
                      checked={cfg.atividade.tipos.includes(t.value)}
                      onChange={(sim) => alterar('atividade', { tipos: sim ? [...cfg.atividade.tipos, t.value] : cfg.atividade.tipos.filter((x) => x !== t.value) })}
                      disabled={somenteLeitura}
                      label={t.label}
                    />
                  ))}
                </div>
              </div>
            </div>
            {Texto({ evento: 'atividade', id: 'auto-atividade-texto', rotulo: 'Mensagem para o cliente', valor: cfg.atividade.texto, onChange: (texto) => alterar('atividade', { texto }) })}
            {Texto({
              evento: 'atividade_vendedor',
              id: 'auto-atividade-vendedor',
              rotulo: 'Mensagem para o vendedor',
              valor: cfg.atividade.texto_vendedor,
              onChange: (texto_vendedor) => alterar('atividade', { texto_vendedor }),
            })}
          </>
        ),
      })}

      {Cartao({
        evento: 'proposta',
        titulo: 'Proposta perto de vencer',
        descricao: 'Proposta com status "enviada" (sem resposta do cliente): avisa antes da data de validade.',
        children: (
          <>
            {Numero({ id: 'auto-proposta-dias', rotulo: 'Dias antes da validade', valor: cfg.proposta.dias, onChange: (dias) => alterar('proposta', { dias }), dica: 'De 0 (no dia) a 60' })}
            {Texto({ evento: 'proposta', id: 'auto-proposta-texto', rotulo: 'Mensagem', valor: cfg.proposta.texto, onChange: (texto) => alterar('proposta', { texto }) })}
          </>
        ),
      })}

      {Cartao({
        evento: 'pedido',
        titulo: 'Status do pedido',
        descricao: 'Avisa quando o pedido passa a aprovado ou faturado. Vale só para mudanças feitas depois de ligar.',
        children: (
          <>
            {Texto({ evento: 'pedido', id: 'auto-pedido-aprovado', rotulo: 'Pedido aprovado', valor: cfg.pedido.aprovado, onChange: (aprovado) => alterar('pedido', { aprovado }), dica: 'Em branco: não avisa.' })}
            {Texto({ evento: 'pedido', id: 'auto-pedido-faturado', rotulo: 'Pedido faturado', valor: cfg.pedido.faturado, onChange: (faturado) => alterar('pedido', { faturado }), dica: 'Em branco: não avisa.' })}
          </>
        ),
      })}

      {Cartao({
        evento: 'contrato',
        titulo: 'Contrato perto de vencer',
        descricao: 'Contrato ativo: avisa antes do fim da vigência. Renovado (fim novo), avisa de novo no próximo vencimento.',
        children: (
          <>
            {Numero({ id: 'auto-contrato-dias', rotulo: 'Dias antes do fim', valor: cfg.contrato.dias, onChange: (dias) => alterar('contrato', { dias }), dica: 'De 1 a 180' })}
            {Texto({ evento: 'contrato', id: 'auto-contrato-texto', rotulo: 'Mensagem', valor: cfg.contrato.texto, onChange: (texto) => alterar('contrato', { texto }) })}
          </>
        ),
      })}

      {Cartao({
        evento: 'assinatura',
        titulo: 'Assinatura pendente',
        descricao: 'Documento do contrato enviado para assinatura (D4Sign) e ainda não assinado: um lembrete, depois de alguns dias.',
        children: (
          <>
            {Numero({ id: 'auto-assinatura-dias', rotulo: 'Dias sem assinatura', valor: cfg.assinatura.dias, onChange: (dias) => alterar('assinatura', { dias }), dica: 'De 1 a 30' })}
            {Texto({ evento: 'assinatura', id: 'auto-assinatura-texto', rotulo: 'Mensagem', valor: cfg.assinatura.texto, onChange: (texto) => alterar('assinatura', { texto }) })}
          </>
        ),
      })}

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
