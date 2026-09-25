import React, { useState } from 'react';
import { Usuario } from '../types';
import { CamposPersonalizados } from './CamposPersonalizados';
import { ConfigEmail } from './ConfigEmail';
import { ConfigWhatsApp } from './ConfigWhatsApp';
import { ConfigAutomaticas } from './ConfigAutomaticas';
import { ConfigChatbot } from './ConfigChatbot';
import { ConfigJornada } from './ConfigJornada';
import { ConfigVendas } from './ConfigVendas';
import { ConfigAssinatura } from './ConfigAssinatura';
import { ModelosContrato } from './ModelosContrato';

/**
 * Configurações da empresa, no mesmo formato do meuConsultorioWeb: uma aba por
 * grupo de configuração. Cada aba grava na tabela `config` (empresa + grupo + chave).
 */
const ABAS = [
  {
    id: 'pessoas',
    titulo: 'Campos Personalizados de Pessoas',
    descricao: 'Campos extras que aparecem no cadastro de pessoas, definidos por você.',
  },
  {
    id: 'email',
    titulo: 'E-mail (SMTP)',
    descricao: 'Servidor de e-mail usado para enviar propostas aos clientes.',
  },
  {
    id: 'whatsapp',
    titulo: 'WhatsApp',
    descricao: 'Provedor usado para enviar propostas e as mensagens das campanhas.',
  },
  {
    id: 'chatbot',
    titulo: 'Chatbot',
    descricao: 'Assistente com IA (Gemini) que responde o WhatsApp, cadastra leads para os vendedores e passa para um humano quando precisa.',
  },
  {
    id: 'jornada',
    titulo: 'Jornada',
    descricao: 'Fluxo de atendimento do WhatsApp desenhado em nós: menus, perguntas, condições, esperas, chamadas de API, IA e departamentos.',
  },
  {
    id: 'automaticas',
    titulo: 'Mensagens automáticas',
    descricao: 'WhatsApp enviado ao cliente quando algo acontece no CRM: lembrete de atividade, proposta e contrato perto de vencer, pedido aprovado ou faturado.',
  },
  {
    id: 'vendas',
    titulo: 'Vendas',
    descricao: 'Comportamentos do envio de propostas e pedidos.',
  },
  {
    id: 'assinatura',
    titulo: 'Assinatura (D4Sign)',
    descricao: 'Conta da D4Sign usada para enviar os contratos para assinatura eletrônica.',
  },
  {
    id: 'modelos_contrato',
    titulo: 'Modelos de contrato',
    descricao: 'Textos dos contratos com variáveis: ao gerar o PDF de um contrato, escolhe-se o modelo e os dados dele são preenchidos.',
  },
];

interface Props {
  usuario: Usuario | null;
  onToast: (msg: string) => void;
}

export const ConfiguracoesView: React.FC<Props> = ({ usuario, onToast }) => {
  const [aba, setAba] = useState(ABAS[0].id);
  const somenteLeitura = usuario?.tipo !== 'admin';
  const atual = ABAS.find((a) => a.id === aba) || ABAS[0];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-stone-900">
      {/* Abas dos grupos de configuração */}
      <div className="bg-stone-50 dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800 flex overflow-x-auto shrink-0">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-3 text-xs font-bold shrink-0 border-b-2 transition-all cursor-pointer ${
              aba === a.id
                ? 'border-blue-600 text-blue-600 bg-white dark:bg-stone-900 dark:text-blue-400'
                : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-200'
            }`}
          >
            {a.titulo}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-4">
          <div className="mb-3">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">{atual.titulo}</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{atual.descricao}</p>
          </div>

          {somenteLeitura && (
            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
              Somente administradores alteram as configurações da empresa.
            </div>
          )}

          {aba === 'pessoas' && <CamposPersonalizados somenteLeitura={somenteLeitura} onToast={onToast} />}
          {aba === 'email' && <ConfigEmail somenteLeitura={somenteLeitura} onToast={onToast} />}
          {aba === 'whatsapp' && <ConfigWhatsApp somenteLeitura={somenteLeitura} onToast={onToast} />}
          {aba === 'chatbot' && <ConfigChatbot somenteLeitura={somenteLeitura} onToast={onToast} />}
          {aba === 'jornada' && <ConfigJornada somenteLeitura={somenteLeitura} onToast={onToast} />}
          {aba === 'automaticas' && <ConfigAutomaticas somenteLeitura={somenteLeitura} onToast={onToast} />}
          {aba === 'vendas' && <ConfigVendas somenteLeitura={somenteLeitura} onToast={onToast} />}
          {aba === 'assinatura' && <ConfigAssinatura somenteLeitura={somenteLeitura} onToast={onToast} />}
          {aba === 'modelos_contrato' && <ModelosContrato somenteLeitura={somenteLeitura} onToast={onToast} />}
        </div>
      </div>
    </div>
  );
};
