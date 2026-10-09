import Dexie, { liveQuery, type Table } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * App do técnico, offline-first: as OS ficam no IndexedDB do aparelho (Dexie). Cada alteração grava na hora
 * na OS local e entra numa fila; a fila vai para o servidor quando há sinal (server/os.ts, /api/os-tecnico).
 * A fila só sai do aparelho depois que o servidor aceitou: fechar o app ou ficar sem sinal não perde nada.
 */

export interface OS {
  id: number;
  numero: number;
  tipo: string;
  status: 'aberta' | 'em_execucao' | 'concluida' | 'cancelada';
  data_agendada: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  endereco: string | null;
  servico_solicitado: string | null;
  servico_executado: string | null;
  inicio_em: string | null;
  fim_em: string | null;
  inicio_geo?: string | null;
  fim_geo?: string | null;
  /** Só a coletada aqui, até ir para o servidor (a do servidor não volta: basta saber que existe) */
  assinatura?: string | null;
  assinada: number | boolean;
  assinatura_nome: string | null;
  assinatura_documento: string | null;
  pessoa_nome: string;
  pessoa_cpf: string | null;
  pessoa_telefone: string | null;
  pessoa_whatsapp: string | null;
  /** O servidor recusou uma alteração desta OS (ex.: cancelada): a fila dela para até o técnico decidir */
  erro?: string | null;
}

export type Alteracao = Partial<Pick<OS, 'status' | 'servico_executado' | 'inicio_em' | 'fim_em' | 'inicio_geo' | 'fim_geo' | 'assinatura' | 'assinatura_nome' | 'assinatura_documento'>>;

interface Pendencia {
  seq?: number;
  osId: number;
  dados: Alteracao;
}

class Banco extends Dexie {
  os!: Table<OS, number>;
  fila!: Table<Pendencia, number>;
  constructor() {
    super('crmweb_tecnico');
    this.version(1).stores({ os: 'id', fila: '++seq, osId' });
  }
}

export const db = new Banco();

/** Data e hora do aparelho (Brasília), no formato do MySQL — nunca toISOString() */
export function agora(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * "lat,lng" do aparelho; sem permissão, sem sinal de GPS ou demorando, segue sem (null). O timeout do navegador
 * não conta enquanto o pedido de permissão está na tela: o relógio próprio garante que o técnico não fica preso.
 */
export function localizacao(): Promise<string | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    setTimeout(() => ok(null), 12000);
    navigator.geolocation.getCurrentPosition(
      (p) => ok(`${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

/** Grava na OS local e põe na fila (as duas coisas ou nenhuma) */
export async function alterar(osId: number, dados: Alteracao) {
  await db.transaction('rw', db.os, db.fila, async () => {
    await db.os.update(osId, { ...dados, ...('assinatura' in dados ? { assinada: Boolean(dados.assinatura) } : {}) });
    await db.fila.add({ osId, dados });
  });
}

/** Desiste do que está na fila da OS (depois de o servidor recusar); a próxima sincronização traz a do servidor */
export async function descartar(osId: number) {
  await db.transaction('rw', db.os, db.fila, async () => {
    await db.fila.where('osId').equals(osId).delete();
    await db.os.update(osId, { erro: null });
  });
}

export async function limparTudo() {
  await db.transaction('rw', db.os, db.fila, async () => {
    await db.os.clear();
    await db.fila.clear();
  });
}

export class SessaoExpirada extends Error {}

let emAndamento: Promise<void> | null = null;

/**
 * Envia a fila e depois baixa as OS do técnico. Sem sinal, para no primeiro envio que falhar (tenta de novo
 * depois). Recusa do servidor (4xx) trava só a fila daquela OS, com o motivo na própria OS.
 */
export function sincronizar(token: string): Promise<void> {
  emAndamento ??= (async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const travadas = new Set<number>();
    for (const p of await db.fila.orderBy('seq').toArray()) {
      if (travadas.has(p.osId) || (await db.os.get(p.osId))?.erro) {
        travadas.add(p.osId);
        continue;
      }
      const r = await fetch(`/api/os-tecnico/${p.osId}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(p.dados),
      });
      if (r.status === 401) throw new SessaoExpirada('Sessão expirada. Entre novamente.');
      if (r.status >= 500) throw new Error(`Servidor indisponível (HTTP ${r.status}).`);
      if (!r.ok) {
        const msg = (await r.json().catch(() => ({})))?.error || `Recusado (HTTP ${r.status}).`;
        await db.os.update(p.osId, { erro: msg });
        travadas.add(p.osId);
        continue;
      }
      await db.fila.delete(p.seq!);
    }

    const r = await fetch('/api/os-tecnico', { headers: auth });
    if (r.status === 401) throw new SessaoExpirada('Sessão expirada. Entre novamente.');
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Falha ao baixar as OS (HTTP ${r.status}).`);
    const doServidor: OS[] = await r.json();

    // A do servidor, com o que ainda está na fila por cima (assim nada digitado aqui some)
    await db.transaction('rw', db.os, db.fila, async () => {
      const fila = await db.fila.orderBy('seq').toArray();
      const comFila = new Set(fila.map((p) => p.osId));
      const ids = new Set(doServidor.map((o) => o.id));
      const locais = await db.os.toArray();
      await db.os.bulkDelete(locais.filter((o) => !ids.has(o.id) && !comFila.has(o.id)).map((o) => o.id));
      const erros = new Map(locais.map((o) => [o.id, o.erro]));
      await db.os.bulkPut(
        doServidor.map((o) =>
          fila
            .filter((p) => p.osId === o.id)
            .reduce<OS>((os, p) => ({ ...os, ...p.dados, ...('assinatura' in p.dados ? { assinada: Boolean(p.dados.assinatura) } : {}) }), {
              ...o,
              erro: comFila.has(o.id) ? erros.get(o.id) ?? null : null,
            }),
        ),
      );
    });
  })().finally(() => (emAndamento = null));
  return emAndamento;
}

/** Resultado de uma consulta ao Dexie que se atualiza sozinho quando os dados mudam */
export function useConsulta<T>(consulta: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [valor, setValor] = useState<T>();
  useEffect(() => {
    const s = liveQuery(consulta).subscribe({ next: setValor, error: (e) => console.error(e) });
    return () => s.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return valor;
}
