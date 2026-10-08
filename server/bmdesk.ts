/**
 * Integração com o BMDesk (acesso remoto pelo MeshCentral, na VPS da BMSoft): servidor a servidor,
 * com a chave em x-bmdesk-chave. O BMDesk guarda o vínculo computador → pessoa (bmdesk_computadores,
 * no mesmo banco) e abre a tela remota com a conta de serviço dele.
 * BMDESK_URL e BMDESK_CHAVE no .env (e nas variáveis da Vercel); sem eles a integração fica desligada.
 */

const TIMEOUT_BMDESK_MS = 15000;

function erro(status: number, msg: string) {
  return Object.assign(new Error(msg), { status });
}

/** GET, ou POST com corpo JSON quando há corpo */
export async function chamarBmdesk(caminho: string, corpo?: unknown): Promise<any> {
  const url = process.env.BMDESK_URL;
  const chave = process.env.BMDESK_CHAVE;
  if (!url || !chave) throw erro(503, 'Acesso remoto BMDesk não configurado: defina BMDESK_URL e BMDESK_CHAVE.');
  const r = await fetch(`${url.replace(/\/$/, '')}${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'x-bmdesk-chave': chave, ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(TIMEOUT_BMDESK_MS),
  }).catch((e) => {
    throw erro(502, `BMDesk não respondeu: ${e.message}`);
  });
  const dados: any = await r.json().catch(() => ({}));
  if (!r.ok) throw erro([400, 403, 404, 409].includes(r.status) ? r.status : 502, `BMDesk: ${dados?.error || `HTTP ${r.status}`}`);
  return dados;
}
