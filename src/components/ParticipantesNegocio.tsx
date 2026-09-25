import React, { useState } from 'react';
import { Loader2, Users, X } from 'lucide-react';
import { OpcaoRef } from '../types';
import { INPUT_CLASS, HINT_CLASS } from '../utils/formStyles';
import { SelectBusca } from './SelectBusca';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  /** Ids dos usuários envolvidos */
  ids: number[];
  onChange: (ids: number[]) => void;
  /** Usuários da empresa (mesmas opções do combo de proprietário) */
  opcoes: OpcaoRef[];
  /** O proprietário não aparece para ser adicionado como envolvido */
  proprietarioId?: string | number | null;
  carregando?: boolean;
}

/**
 * Outros usuários envolvidos no negócio, além do proprietário. A lista é gravada junto
 * com o negócio, no Salvar do formulário.
 */
export const ParticipantesNegocio: React.FC<Props> = ({ ids, onChange, opcoes, proprietarioId, carregando }) => {
  const [removendo, setRemovendo] = useState<number | null>(null);
  // Escolhido como proprietário, sai dos envolvidos (ele já é o dono)
  const visiveis = ids.filter((id) => String(id) !== String(proprietarioId ?? ''));
  const nome = (id: number) => opcoes.find((o) => o.value === String(id))?.label ?? `Usuário ${id}`;
  const disponiveis = opcoes.filter(
    (o) => !ids.includes(Number(o.value)) && o.value !== String(proprietarioId ?? '') && !o.label.endsWith('(inativo)'),
  );

  return (
    <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
      <div className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200 mb-3">
        <Users className="w-4 h-4 text-stone-400" />
        Envolvidos
        {carregando && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {visiveis.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900"
          >
            {nome(id)}
            <button
              type="button"
              onClick={() => setRemovendo(id)}
              title={`Remover ${nome(id)}`}
              className="p-0.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="w-64">
          <SelectBusca
            value=""
            options={disponiveis}
            onChange={(v) => v && onChange([...ids, Number(v)])}
            vazioLabel="— Adicionar envolvido —"
            className={`${INPUT_CLASS} w-full`}
          />
        </div>
      </div>
      {!carregando && visiveis.length === 0 && <p className={`${HINT_CLASS} mt-1.5`}>Nenhum outro usuário envolvido.</p>}

      {removendo !== null && (
        <ConfirmDialog
          titulo="Remover envolvido?"
          mensagem={`${nome(removendo)} deixa de estar envolvido neste negócio ao salvar.`}
          confirmar="Remover"
          onConfirmar={() => {
            onChange(ids.filter((i) => i !== removendo));
            setRemovendo(null);
          }}
          onCancelar={() => setRemovendo(null)}
        />
      )}
    </div>
  );
};
