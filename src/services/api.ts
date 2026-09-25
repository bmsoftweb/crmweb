import {
  ResourceDef,
  ListaPaginada,
  FiltroAvancado,
  RegistroCrud,
  OpcaoRef,
  DbConnectionStatus,
  DashboardData,
  Usuario,
  EmpresaSessao,
  Funil,
  CardNegocio,
  FichaNegocio,
  ProdutoBusca,
  Id,
  CampoPersonalizado,
  Endereco,
} from '../types';

/** O token da sessão acompanha toda requisição no header Authorization */
let tokenAtual: string | null = null;
let aoExpirar: ((msg: string) => void) | null = null;

export function setTokenSessao(token: string | null) {
  tokenAtual = token;
}

/** Chamado quando o servidor recusa o token (sessão expirada ou usuário desativado) */
export function setAoExpirarSessao(fn: ((msg: string) => void) | null) {
  aoExpirar = fn;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (tokenAtual) h.Authorization = `Bearer ${tokenAtual}`;
  return h;
}

async function parseOrThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `Falha na requisição (HTTP ${res.status}).`;
    if (res.status === 401 && aoExpirar) aoExpirar(msg);
    throw new Error(msg);
  }
  return data;
}

const get = (url: string) => fetch(url, { headers: headers() }).then(parseOrThrow);
const enviar = (method: string, url: string, corpo?: unknown) =>
  fetch(url, {
    method,
    headers: headers({ 'Content-Type': 'application/json' }),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).then(parseOrThrow);

// ------------------------------------------------------------
// Autenticação e preferências
// ------------------------------------------------------------
export async function login(payload: { email: string; senha: string }): Promise<{
  success: boolean;
  primeiroAcesso?: boolean;
  message?: string;
  token: string;
  usuario: Usuario;
  empresa: EmpresaSessao;
}> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha no login (HTTP ${res.status}).`);
  return data;
}

/**
 * Confere se a sessão guardada no navegador ainda vale.
 * Retorna false só quando o servidor recusa; falha de rede ou de banco devolve null,
 * para não deslogar ninguém por instabilidade.
 */
export async function validarSessao(): Promise<{ valida: boolean | null; error?: string }> {
  try {
    const res = await fetch('/api/sessao', { headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { valida: false, error: data?.error };
    return { valida: res.ok ? true : null, error: data?.error };
  } catch {
    return { valida: null };
  }
}

export const fetchConfigListas = (): Promise<Record<string, unknown>> => get('/api/config-listas');

export async function saveConfigListas(config: Record<string, unknown>): Promise<void> {
  await enviar('PUT', '/api/config-listas', config);
}

// ------------------------------------------------------------
// Metadados e painel
// ------------------------------------------------------------
export const fetchResources = (): Promise<ResourceDef[]> => get('/api/meta/resources');

export async function fetchDbStatus(): Promise<DbConnectionStatus> {
  try {
    const res = await fetch('/api/db/status');
    return await res.json();
  } catch (err: any) {
    return { connected: false, latencyMs: 0, error: err.message || 'Falha ao conectar com a API' };
  }
}

export const fetchDashboard = (): Promise<DashboardData> => get('/api/crm/dashboard');

// ------------------------------------------------------------
// CRUD genérico
// ------------------------------------------------------------
export function listRecords(
  resource: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    filterField?: string;
    filterValue?: string;
    filters?: FiltroAvancado[];
    /** Recurso em árvore: só as raízes */
    arvore?: 'raizes';
    /** Só as do usuário logado (recurso com filtro "minhas") */
    minhas?: boolean;
  } = {},
): Promise<ListaPaginada> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);
  if (params.dir) qs.set('dir', params.dir);
  if (params.filterField && params.filterValue) {
    qs.set('filter_field', params.filterField);
    qs.set('filter_value', params.filterValue);
  }
  if (params.filters && params.filters.length) qs.set('filters', JSON.stringify(params.filters));
  if (params.arvore) qs.set('arvore', params.arvore);
  if (params.minhas) qs.set('minhas', '1');
  return get(`/api/crud/${resource}?${qs.toString()}`);
}

export const getRecord = (resource: string, id: Id): Promise<RegistroCrud> =>
  get(`/api/crud/${resource}/${encodeURIComponent(String(id))}`);

export const createRecord = (resource: string, payload: RegistroCrud): Promise<{ success: boolean; id: string }> =>
  enviar('POST', `/api/crud/${resource}`, payload);

export const updateRecord = (resource: string, id: Id, payload: RegistroCrud): Promise<{ success: boolean }> =>
  enviar('PUT', `/api/crud/${resource}/${encodeURIComponent(String(id))}`, payload);

export const deleteRecord = (resource: string, id: Id): Promise<{ success: boolean }> =>
  enviar('DELETE', `/api/crud/${resource}/${encodeURIComponent(String(id))}`);

// ------------------------------------------------------------
// CRM: Kanban, ficha do negócio, propostas e pedidos
// ------------------------------------------------------------
export const fetchFunis = (): Promise<Funil[]> => get('/api/crm/funis');
export const criarFunilPadrao = (): Promise<{ id: string }> => enviar('POST', '/api/crm/funis/padrao');
export const fetchKanban = (funilId: Id): Promise<CardNegocio[]> => get(`/api/crm/kanban/${encodeURIComponent(String(funilId))}`);
export const moverNegocio = (id: Id, etapaId: Id) =>
  enviar('PATCH', `/api/crm/negocios/${encodeURIComponent(String(id))}/etapa`, { etapa_id: etapaId });
export const mudarStatusNegocio = (id: Id, status: string, motivoPerda?: string) =>
  enviar('PATCH', `/api/crm/negocios/${encodeURIComponent(String(id))}/status`, { status, motivo_perda: motivoPerda });
export const fetchFichaNegocio = (id: Id): Promise<FichaNegocio> => get(`/api/crm/negocios/${encodeURIComponent(String(id))}`);

export const buscarProdutos = (q: string): Promise<ProdutoBusca[]> => get(`/api/crm/produtos?q=${encodeURIComponent(q)}`);

export type TipoDocumento = 'propostas' | 'pedidos';
export const fetchDocumento = (tipo: TipoDocumento, id: Id): Promise<RegistroCrud> =>
  get(`/api/crm/${tipo}/${encodeURIComponent(String(id))}`);
export const salvarDocumento = (tipo: TipoDocumento, id: Id | null, payload: RegistroCrud): Promise<{ id: string }> =>
  id ? enviar('PUT', `/api/crm/${tipo}/${encodeURIComponent(String(id))}`, payload) : enviar('POST', `/api/crm/${tipo}`, payload);
export const novaVersaoProposta = (id: Id): Promise<{ id: string }> =>
  enviar('POST', `/api/crm/propostas/${encodeURIComponent(String(id))}/versao`);
/**
 * Cópia da proposta (número próprio, v1, rascunho) ou do pedido (número próprio, rascunho).
 * Devolve o registro novo no formato da linha da lista, para abrir na aba de edição.
 */
export const clonarDocumento = (
  tipo: 'propostas' | 'pedidos',
  id: Id,
): Promise<{ id: number; numero_proposta?: number; numero_pedido?: number; titulo?: string }> =>
  enviar('POST', `/api/crm/${tipo}/${encodeURIComponent(String(id))}/clonar`);
export const aprovarProposta = (id: Id): Promise<{ id: string; numero_pedido: number }> =>
  enviar('POST', `/api/crm/propostas/${encodeURIComponent(String(id))}/aprovar`);

// ------------------------------------------------------------
// Combos de chave estrangeira, com cache em memória
// ------------------------------------------------------------
const optionsCache = new Map<string, OpcaoRef[]>();

export async function fetchOptions(resource: string, labelField: string): Promise<OpcaoRef[]> {
  const key = `${resource}:${labelField}`;
  const cached = optionsCache.get(key);
  if (cached) return cached;
  const data = await get(`/api/options/${resource}?label_field=${encodeURIComponent(labelField)}`);
  optionsCache.set(key, data);
  return data;
}

/** Invalida o cache de combos após gravações que alteram listas de referência */
export function invalidateOptions(resource?: string) {
  if (!resource) {
    optionsCache.clear();
    return;
  }
  for (const key of Array.from(optionsCache.keys())) {
    if (key.startsWith(`${resource}:`)) optionsCache.delete(key);
  }
}

// ------------------------------------------------------------
// Importação do bmsoft (bmAPI)
// ------------------------------------------------------------
/** Importa a tabela PESSOAS do bmsoft para o CRM, casando por PESSOAS.ID = cod_integracao */
export function importarPessoasBM(servidor: number): Promise<{
  servidor: string;
  lidos: number;
  inseridos: number;
  atualizados: number;
  inalterados: number;
}> {
  return enviar('POST', '/api/import-bm/pessoas', { servidor });
}

/** Importação de pessoas de arquivo: linhas já no formato dos campos do CRM, em lotes */
export function importarPessoasArquivo(
  linhas: Record<string, any>[],
  opcoes: { atualizar: boolean; criarSegmentos: boolean; padrao: Record<string, any> },
): Promise<{
  inseridos: number;
  atualizados: number;
  ignorados: number;
  semNome: number;
  enderecos: number;
  segmentosCriados: number;
  segmentosNaoEncontrados: string[];
}> {
  return enviar('POST', '/api/importar/pessoas', { linhas, ...opcoes });
}

/** Usuários envolvidos no negócio (ids e nomes) */
export const fetchParticipantes = (negocioId: Id): Promise<{ id: number; nome: string }[]> =>
  get(`/api/negocios/${negocioId}/participantes`).then((l) => {
    if (!Array.isArray(l)) throw new Error('Não foi possível carregar os envolvidos: resposta inesperada do servidor.');
    return l;
  });

/** Endereços da pessoa, o principal primeiro */
export const fetchEnderecos = (pessoaId: Id): Promise<Endereco[]> =>
  get(`/api/pessoas/${pessoaId}/enderecos`).then((l) => {
    // Resposta que não é lista (ex.: servidor desatualizado devolvendo a página) não pode chegar ao formulário
    if (!Array.isArray(l)) throw new Error('Não foi possível carregar os endereços: resposta inesperada do servidor.');
    return l;
  });

/** Identificação do servidor da bmAPI, para conferir o número digitado */
export function buscarServidorBM(numero: number): Promise<{ numero: number; identificacao: string }> {
  return get(`/api/import-bm/servidores/${numero}`);
}

// ------------------------------------------------------------
// Configurações da empresa (tabela config)
// ------------------------------------------------------------
export const fetchConfig = <T = any>(grupo: string, chave: string): Promise<{ valor: T | null }> =>
  get(`/api/config/${grupo}/${chave}`);

export const salvarConfig = (grupo: string, chave: string, valor: unknown): Promise<{ success: boolean }> =>
  enviar('PUT', `/api/config/${grupo}/${chave}`, { valor });

/** Imagem do nó "Enviar imagem" da jornada (base64 sem o prefixo data:) */
export const enviarArquivoJornada = (nome: string, mimetype: string, base64: string): Promise<{ id: number; nome: string }> =>
  enviar('POST', '/api/jornada/arquivos', { nome, mimetype, base64 });
/** Imagem da jornada como endereço local (blob:) para mostrar no editor */
export async function fetchArquivoJornada(id: number): Promise<string> {
  const res = await fetch(`/api/jornada/arquivos/${id}`, { headers: headers() });
  if (!res.ok) await parseOrThrow(res);
  return URL.createObjectURL(await res.blob());
}

/**
 * Campos personalizados de pessoas, com cache: a definição muda raramente e é lida
 * a cada abertura do formulário.
 */
let camposPessoaCache: Promise<CampoPersonalizado[]> | null = null;

export function fetchCamposPersonalizados(): Promise<CampoPersonalizado[]> {
  if (!camposPessoaCache) {
    camposPessoaCache = fetchConfig<CampoPersonalizado[]>('pessoas', 'campos_personalizados')
      .then(({ valor }) => (Array.isArray(valor) ? valor : []))
      .catch((err) => {
        camposPessoaCache = null; // falha não fica em cache
        throw err;
      });
  }
  return camposPessoaCache;
}

/** Chamado ao gravar a configuração, para o formulário já abrir com os campos novos */
export function invalidarCamposPersonalizados() {
  camposPessoaCache = null;
}

// ------------------------------------------------------------
// Campanhas
// ------------------------------------------------------------
export interface RegraCriterio {
  regra: string;
  rotulo: string;
  valor: 'numero' | 'texto' | 'sim_nao' | 'tipo_pessoa' | 'segmento';
}
let regrasCache: Promise<RegraCriterio[]> | null = null;
export const fetchRegrasCriterio = (): Promise<RegraCriterio[]> =>
  (regrasCache ??= get('/api/campanhas/regras').catch((err: Error) => {
    regrasCache = null;
    throw err;
  }));
export const calcularSegmento = (id: Id): Promise<{ total: number }> =>
  enviar('POST', `/api/campanhas/segmentos/${encodeURIComponent(String(id))}/calcular`);
export const previaMensagem = (id: Id): Promise<{ nome: string; assunto: string; corpo: string }[]> =>
  get(`/api/campanhas/mensagens/${encodeURIComponent(String(id))}/previa`);
export const gerarDisparos = (id: Id): Promise<{ gerados: number }> =>
  enviar('POST', `/api/campanhas/${encodeURIComponent(String(id))}/disparos`);

/** Envia a proposta ou o pedido em PDF por e-mail ou WhatsApp (o servidor gera o PDF da impressão) */
export const enviarDocumento = (
  tipo: TipoDocumento,
  id: Id,
  dados: { canal: 'email' | 'whatsapp'; destino: string; mensagem: string },
): Promise<{ status: string; statusAlterado: boolean; tarefaRetorno: boolean }> =>
  enviar('POST', `/api/crm/${tipo}/${encodeURIComponent(String(id))}/enviar`, dados);

/** Conecta e autentica no SMTP gravado em Configurações › E-mail, sem enviar nada */
export const testarSmtp = (): Promise<{ success: boolean }> => enviar('POST', '/api/config/email/smtp/testar');

/** Consulta no provedor se o número do WhatsApp gravado em Configurações está conectado */
export const testarWhatsApp = (): Promise<{ conectado: boolean; numero?: string; mensagem: string }> => enviar('POST', '/api/config/whatsapp/provedor/testar');

/** QR Code para conectar o número do WhatsApp gravado; conectado: true se já estiver */
export const conectarWhatsApp = (): Promise<{ conectado: boolean; qrcode?: string }> => enviar('POST', '/api/config/whatsapp/provedor/conectar');

/** Liga o recebimento de mensagens: a Evolution passa a avisar o CRM neste endereço (origem) */
export const ativarRecebimentoWhatsApp = (origem: string): Promise<{ origem: string; em: string }> =>
  enviar('POST', '/api/config/whatsapp/provedor/receber', { origem });

/** Desconecta o número do WhatsApp gravado (depois é preciso ler outro QR Code) */
export const desconectarWhatsApp = (): Promise<{ success: boolean }> => enviar('POST', '/api/config/whatsapp/provedor/desconectar');

// ------------------------------------------------------------
// Contratos: documentos e assinatura (D4Sign)
// ------------------------------------------------------------
export interface DocumentoContrato {
  id: number;
  tipo: 'minuta' | 'assinado' | 'aditivo' | 'distrato' | 'outro';
  nome_arquivo: string;
  mime_type: string;
  tamanho: number;
  assinatura_situacao: 'nao_enviado' | 'enviado' | 'visualizado' | 'assinado' | 'recusado' | 'expirado' | 'cancelado';
  assinatura_enviada_em: string | null;
  assinatura_concluida_em: string | null;
  signatarios: { email: string; assinado: boolean; assinado_em: string | null }[] | null;
  criado_em: string;
}

export const listarDocumentosContrato = (contratoId: Id): Promise<DocumentoContrato[]> =>
  get(`/api/contratos/${encodeURIComponent(String(contratoId))}/documentos`);
export const anexarDocumentoContrato = (
  contratoId: Id,
  dados: { tipo: string; nome_arquivo: string; mime_type: string; conteudo_base64: string },
): Promise<{ id: number }> => enviar('POST', `/api/contratos/${encodeURIComponent(String(contratoId))}/documentos`, dados);
export const excluirDocumentoContrato = (docId: Id) => enviar('DELETE', `/api/contratos/documentos/${encodeURIComponent(String(docId))}`);
export const enviarAssinaturaContrato = (docId: Id, dados: { emails: string[]; mensagem: string }) =>
  enviar('POST', `/api/contratos/documentos/${encodeURIComponent(String(docId))}/assinatura`, dados);
export const atualizarAssinaturaContrato = (docId: Id): Promise<{ situacao: string }> =>
  enviar('POST', `/api/contratos/documentos/${encodeURIComponent(String(docId))}/assinatura/atualizar`);
export const cancelarAssinaturaContrato = (docId: Id, motivo: string) =>
  enviar('POST', `/api/contratos/documentos/${encodeURIComponent(String(docId))}/assinatura/cancelar`, { motivo });
export const reenviarAssinaturaContrato = (docId: Id, email: string) =>
  enviar('POST', `/api/contratos/documentos/${encodeURIComponent(String(docId))}/assinatura/reenviar`, { email });

/** Arquivo do documento (o download precisa do token da sessão, por isso não é um link simples) */
export async function baixarDocumentoContrato(docId: Id): Promise<Blob> {
  const r = await fetch(`/api/contratos/documentos/${encodeURIComponent(String(docId))}/arquivo`, { headers: headers() });
  if (!r.ok) await parseOrThrow(r);
  return r.blob();
}

/** Webhook 2.0: cadastra o endereço do CRM no cofre gravado, na D4Sign */
export const cadastrarWebhookCofreD4Sign = (): Promise<{ url: string; conferido: boolean }> => enviar('POST', '/api/config/assinatura/d4sign/webhook');

/** Testa as chaves da D4Sign gravadas e devolve os cofres da conta */
export const testarD4Sign = (): Promise<{ cofres: { uuid: string; nome: string }[]; cofre: string; cofre_ok: boolean }> => enviar('POST', '/api/config/assinatura/d4sign/testar');

/** Gera o contrato (rascunho) da proposta aceita, com cliente, negócio e itens copiados */
export const gerarContratoDaProposta = (id: Id): Promise<{ id: number; numero: number }> =>
  enviar('POST', `/api/crm/propostas/${encodeURIComponent(String(id))}/contrato`);

/** Variáveis aceitas nos modelos de contrato */
export const variaveisContrato = (): Promise<{ nome: string; descricao: string }[]> => get('/api/contratos/modelo/variaveis');

/** Modelos de contrato da empresa (Configurações › Modelos de contrato) */
export interface ModeloContrato {
  id?: number;
  descricao: string;
  formato_html: string;
}
export const listarModelosContrato = (): Promise<{ id: number; descricao: string }[]> => get('/api/contratos/modelos');
export const getModeloContrato = (id: Id): Promise<Required<ModeloContrato>> => get(`/api/contratos/modelos/${encodeURIComponent(String(id))}`);
export const salvarModeloContrato = (m: ModeloContrato): Promise<{ success: boolean; id?: number }> =>
  m.id ? enviar('PUT', `/api/contratos/modelos/${m.id}`, m) : enviar('POST', '/api/contratos/modelos', m);
export const excluirModeloContrato = (id: Id) => enviar('DELETE', `/api/contratos/modelos/${encodeURIComponent(String(id))}`);

/** Trava do contrato assinado: só muda por aditivo, depois de liberado por um administrador */
export interface TravaContrato {
  assinado: boolean;
  liberado_em: string | null;
  liberado_por: string | null;
  pode_liberar: boolean;
  /** Assinado e não liberado para aditivo */
  travado: boolean;
  /** Campos do contrato que continuam editáveis quando travado */
  campos_livres: string[];
}
export const travaContrato = (id: Id): Promise<TravaContrato> => get(`/api/contratos/${encodeURIComponent(String(id))}/trava`);
export const liberarAditivoContrato = (id: Id, motivo: string) =>
  enviar('POST', `/api/contratos/${encodeURIComponent(String(id))}/liberar-aditivo`, { motivo });
export const travarContrato = (id: Id) => enviar('POST', `/api/contratos/${encodeURIComponent(String(id))}/travar`);

/** Gera o PDF do contrato pelo modelo escolhido e guarda como minuta */
export const gerarMinutaContrato = (contratoId: Id, modeloId?: Id): Promise<{ id: number; nome: string }> =>
  enviar('POST', `/api/contratos/${encodeURIComponent(String(contratoId))}/gerar-minuta`, { modelo_id: modeloId });

// ------------------------------------------------------------
// Conversas do WhatsApp
// ------------------------------------------------------------
export interface ConversaResumo {
  telefone: string;
  pessoa_id: number | null;
  nome: string | null;
  /** Contato da pessoa dono do número (pessoas_contatos), com departamento ou cargo */
  contato_id: number | null;
  contato_nome: string | null;
  contato_setor: string | null;
  /** Nome do perfil no WhatsApp (quem não está em Pessoas) */
  nome_contato: string | null;
  direcao: 'recebida' | 'enviada';
  tipo: string;
  texto: string | null;
  arquivo_nome: string | null;
  situacao: string;
  data_hora: string;
  nao_vistas: number;
  /** Departamento escolhido no menu do chatbot */
  departamento: string | null;
  /** bot = com o bot/jornada; aguardando = esperando alguém atender; atendimento = alguém pegou */
  estado: 'bot' | 'aguardando' | 'atendimento' | null;
  atendente_nome: string | null;
  atendido_em: string | null;
  aguardando_desde: string | null;
}

export interface MensagemWhatsApp {
  id: number;
  direcao: 'recebida' | 'enviada';
  tipo: string;
  texto: string | null;
  arquivo_nome: string | null;
  situacao: 'pendente' | 'enviada' | 'entregue' | 'lida' | 'falhou' | 'recebida';
  usuario_nome: string | null;
  campanha: boolean;
  /** Mensagem automática (Configurações › Mensagens automáticas) */
  automatica: boolean;
  /** Resposta do chatbot */
  bot: boolean;
  /** Motivo, quando não saiu */
  erro: string | null;
  data_hora: string;
}

/** minhas: as sem departamento, as do meu departamento e as que eu assumi */
export const fetchConversas = (busca = '', minhas = false): Promise<ConversaResumo[]> =>
  get(`/api/whatsapp/conversas?busca=${encodeURIComponent(busca)}${minhas ? '&minhas=1' : ''}`);
/** Mensagens da conversa; abrir marca as recebidas como vistas */
export const fetchConversa = (
  telefone: string,
): Promise<{
  pessoa: { id: number; nome: string } | null;
  contato: { id: number; nome: string; cargo: string | null; departamento: string | null } | null;
  /** Com o chatbot ligado: quem atende a conversa (null = chatbot desligado) */
  atendimento: 'bot' | 'humano' | null;
  /** Departamento escolhido no menu do chatbot */
  departamento: string | null;
  /** Nome do assistente (Configurações › Chatbot): as respostas do bot aparecem como "Eloisa (bot)" */
  bot_nome: string | null;
  /** bot = com o bot/jornada; aguardando = esperando alguém atender; atendimento = alguém pegou */
  estado: 'bot' | 'aguardando' | 'atendimento';
  /** Quem pegou a conversa (trava: só ele responde) */
  atendente: { id: number; nome: string } | null;
  atendido_em: string | null;
  aguardando_desde: string | null;
  eu_atendo: boolean;
  sou_admin: boolean;
  /** Bot ou jornada atendem este número (há para onde devolver) */
  com_bot: boolean;
  nome_contato: string | null;
  mensagens: MensagemWhatsApp[];
}> =>
  get(`/api/whatsapp/conversas/${encodeURIComponent(telefone)}`);
/** Envia pela conversa; com a atividade que a abriu, conclui a atividade. telefone: o número da conversa (pode vir sem o 9) */
/** Arquivo para enviar na conversa (base64 sem o prefixo data:) */
export interface ArquivoConversa {
  tipo: 'imagem' | 'video' | 'audio' | 'documento';
  base64: string;
  mimetype: string;
  nome: string;
}
/** Responde a conversa com texto, ou com um arquivo (o texto vira a legenda) */
export const responderConversa = (
  telefone: string,
  texto: string,
  atividadeId?: number | null,
  arquivo?: ArquivoConversa | null,
): Promise<{ success: boolean; telefone: string; atividade_concluida: boolean }> =>
  enviar('POST', `/api/whatsapp/conversas/${encodeURIComponent(telefone)}`, { texto, atividade_id: atividadeId ?? null, arquivo: arquivo ?? undefined });
/** Conversa de uma atividade WhatsApp: o número do cliente (pessoa da atividade ou do negócio) */
export const fetchConversaDaAtividade = (
  id: Id,
): Promise<{ telefone: string; nome: string | null; atividade: { id: number; assunto: string; concluida: boolean } }> =>
  get(`/api/whatsapp/atividades/${encodeURIComponent(String(id))}/conversa`);
/** Imagem, áudio ou vídeo de uma mensagem do WhatsApp, como endereço local (blob:) */
export async function fetchMidiaMensagem(id: number): Promise<string> {
  const res = await fetch(`/api/whatsapp/mensagens/${id}/midia`, { headers: headers() });
  if (!res.ok) await parseOrThrow(res);
  return URL.createObjectURL(await res.blob());
}
/** Conversa passada ao departamento do usuário que ninguém assumiu (aviso sonoro) */
export interface Encaminhada {
  telefone: string;
  nome: string | null;
  departamento: string;
  desde: string;
}
export const fetchNaoVistas = (): Promise<{ total: number; encaminhadas: Encaminhada[] }> => get('/api/whatsapp/nao-vistas');
/** Encerrar a sessão da conversa: como se o tempo de devolver ao bot tivesse passado */
export const encerrarConversa = (telefone: string): Promise<{ success: boolean }> =>
  enviar('POST', `/api/whatsapp/conversas/${encodeURIComponent(telefone)}/encerrar`);
/** Assumir a conversa (o chatbot para) ou devolvê-la ao chatbot */
export const mudarAtendimentoConversa = (telefone: string, atendimento: 'bot' | 'humano'): Promise<{ success: boolean }> =>
  enviar('POST', `/api/whatsapp/conversas/${encodeURIComponent(telefone)}/atendimento`, { atendimento });
/** Atender: pega a conversa e trava para o usuário */
export const atenderConversa = (telefone: string): Promise<{ success: boolean }> => enviar('POST', `/api/whatsapp/conversas/${encodeURIComponent(telefone)}/atender`);
/** Transferir para um atendente ou um departamento */
export const transferirConversa = (telefone: string, destino: { usuario_id?: number; departamento_id?: number }): Promise<{ success: boolean }> =>
  enviar('POST', `/api/whatsapp/conversas/${encodeURIComponent(telefone)}/transferir`, destino);
/** Pergunta curta ao Gemini com a chave e o modelo gravados em Configurações › Chatbot */
export const testarChatbot = (): Promise<{ mensagem: string }> => enviar('POST', '/api/config/whatsapp/chatbot/testar');

/** Para quem dá para abrir uma conversa: pessoa, contato ou o número digitado */
export interface DestinoConversa {
  tipo: 'pessoa' | 'contato' | 'numero';
  pessoa_id: number | null;
  contato_id: number | null;
  nome: string;
  /** Contato: setor e a pessoa (empresa-cliente) */
  detalhe: string | null;
  /** Como está no cadastro */
  fone: string | null;
  /** Número da conversa; null quando não dá para mandar (aviso diz o motivo) */
  telefone: string | null;
  aviso: string | null;
}
/** Número da conversa de uma pessoa ou de um contato (ícone do WhatsApp nas listas) */
export const fetchNumeroConversa = (de: { pessoaId?: Id; contatoId?: Id }): Promise<{ telefone: string; nome: string }> =>
  get(`/api/whatsapp/numero?${de.contatoId ? `contato_id=${encodeURIComponent(String(de.contatoId))}` : `pessoa_id=${encodeURIComponent(String(de.pessoaId))}`}`);
export const fetchDestinosConversa = (busca: string): Promise<DestinoConversa[]> =>
  get(`/api/whatsapp/destinos?busca=${encodeURIComponent(busca)}`);
