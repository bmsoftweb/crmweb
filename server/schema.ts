/**
 * Registro central de metadados das tabelas do banco crmweb.
 *
 * Este arquivo é a ÚNICA fonte de verdade das telas de manutenção:
 *  - o backend usa para montar SQL com whitelist de colunas (evita SQL injection);
 *  - o frontend consome via GET /api/meta/resources para desenhar as telas de CRUD.
 *
 * As chaves primárias são INT AUTO_INCREMENT: quem numera é o MySQL.
 *
 * Multi-tenant: a empresa do usuário logado (usuarios.empresa_id) isola os dados.
 * Todo recurso declara scopeSql, aplicado em TODA consulta (alias "t", um "?" = empresa).
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'decimal'
  | 'date'
  | 'datetime'
  | 'time'
  | 'enum'
  | 'boolean'
  | 'password'
  | 'cnpj'
  /** Imagem embutida (data URI), reduzida no navegador antes de gravar */
  | 'imagem'
  /** Conjunto de campos definidos em Configurações, gravado como JSON */
  | 'personalizados'
  /** Regras de segmentação de campanha, gravadas como JSON (server/campanhas.ts) */
  | 'criterios';

export interface FieldDef {
  /** Nome da coluna no MySQL */
  name: string;
  /** Rótulo exibido na interface */
  label: string;
  type: FieldType;
  /** Texto auxiliar exibido abaixo do campo no formulário */
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** Campo apenas leitura (gerado pelo banco ou pelo sistema): nunca vai em INSERT/UPDATE */
  readOnly?: boolean;
  /** Exibido na grade de listagem */
  listed?: boolean;
  /** Participa da busca textual (LIKE) da barra de busca rápida */
  searchable?: boolean;
  /** Aparece no painel de busca avançada */
  filterable?: boolean;
  /** Opções para type === 'enum' */
  options?: { value: string; label: string }[];
  /** Chave estrangeira: carrega o combo a partir de outro recurso */
  ref?: { resource: string; labelField: string };
  /** Casas decimais para type === 'decimal' */
  scale?: number;
  maxLength?: number;
  /** Desabilita (e zera) o campo quando outro campo tem o valor indicado */
  disabledWhen?: { field: string; equals: string };
  /** Campo numérico que aceita valor negativo (o sinal alterna ao digitar "-") */
  allowNegative?: boolean;
  /** Valor inicial na inclusão */
  default?: string | number | boolean;
  /** Largura sugerida da coluna na grade */
  width?: 'xs' | 'sm' | 'md' | 'lg';
  /** Colunas que o campo ocupa no formulário (de 4); sem isto vale a regra padrão */
  span?: number;
  /**
   * Coluna calculada só da lista: expressão SQL sobre o alias "t" (ex.: subconsulta).
   * Não existe na tabela, não é gravada e não aparece no formulário.
   */
  sql?: string;
}

/** Grade filha exibida no rodapé da listagem quando uma linha é selecionada (mestre-detalhe) */
export interface DetailDef {
  resource: string;
  foreignKey: string;
  label: string;
  /** Campo decimal do filho totalizado no rodapé do painel */
  totalField?: string;
  /** Painel com incluir, editar e excluir (formulário genérico numa janela), com a chave do pai preenchida */
  editavel?: boolean;
}

export interface ResourceDef {
  /** Identificador usado nas rotas: /api/crud/:resource */
  name: string;
  table: string;
  label: string;
  labelSingular: string;
  description: string;
  /** Ícone lucide-react renderizado na sidebar */
  icon: string;
  /** Agrupamento na sidebar */
  group: 'vendas' | 'marketing' | 'cadastros' | 'acesso';
  /** Não aparece no menu (só como detalhe de outro recurso) */
  oculto?: boolean;
  /** Chave primária */
  pk: string[];
  /** Sempre true no crmweb: as PKs são INT AUTO_INCREMENT */
  autoIncrement: boolean;
  /** Campo usado como rótulo em combos de chave estrangeira */
  labelField: string;
  /**
   * SELECT próprio para os combos (colunas value e label), quando o rótulo depende de
   * outra tabela. Ex.: etapa exibida como "Funil › Etapa". Um "?" = empresa logada.
   */
  optionsSql?: string;
  /** Coluna da empresa (tenant), preenchida pelo servidor na inclusão e nunca editável */
  tenantColumn?: string;
  /** Filtro do tenant sobre o alias "t", com um "?" para a empresa logada */
  scopeSql: string;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Excluir só preenche esta coluna com NOW() (o scopeSql deve esconder os excluídos) */
  exclusaoLogica?: string;
  details?: DetailDef[];
  /**
   * Lista em árvore: registros com o mesmo `grupo` formam uma família; o de menor `ordem`
   * é a raiz e os demais aparecem como filhos (ex.: versões de uma proposta).
   */
  arvore?: { grupo: string; ordem: string };
  fields: FieldDef[];
}

const STATUS_NEGOCIO = [
  { value: 'aberto', label: 'Aberto' },
  { value: 'ganho', label: 'Ganho' },
  { value: 'perdido', label: 'Perdido' },
  { value: 'excluido', label: 'Excluído' },
];

export const TIPOS_ATIVIDADE = [
  { value: 'ligacao', label: 'Ligação' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'tarefa', label: 'Tarefa' },
  { value: 'prazo', label: 'Prazo' },
  { value: 'email', label: 'E-mail' },
  { value: 'almoco', label: 'Almoço' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

export const TIPOS_PESSOA = [
  { value: 'lead', label: 'Lead' },
  { value: 'cliente', label: 'Cliente' },
];

export const TIPOS_ENDERECO = [
  { value: 'comercial', label: 'Comercial' },
  { value: 'residencial', label: 'Residencial' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'cobranca', label: 'Cobrança' },
  { value: 'outro', label: 'Outro' },
];

export const TIPOS_INTERACAO = [
  { value: 'nota', label: 'Nota' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'reuniao', label: 'Reunião' },
];

export const STATUS_PROPOSTA = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'aceita', label: 'Aceita' },
  { value: 'recusada', label: 'Recusada' },
  { value: 'expirada', label: 'Expirada' },
  // Outra versão da mesma proposta foi aceita (definido pela aprovação, não à mão)
  { value: 'fechada', label: 'Fechada' },
];

export const STATUS_PEDIDO = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'aguardando_aprovacao', label: 'Aguardando Aprovação' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'faturado', label: 'Faturado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const OBJETIVOS_CAMPANHA = [
  { value: 'reativacao', label: 'Reativação' },
  { value: 'nutricao', label: 'Nutrição' },
  { value: 'conversao', label: 'Conversão' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'retencao', label: 'Retenção' },
  { value: 'upsell', label: 'Upsell' },
];

const CANAIS_CAMPANHA = [
  { value: 'email', label: 'E-mail' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push', label: 'Push' },
  { value: 'multicanal', label: 'Multicanal' },
];

const SITUACOES_CAMPANHA = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'agendada', label: 'Agendada' },
  { value: 'em_execucao', label: 'Em execução' },
  { value: 'pausada', label: 'Pausada' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
];

const TIPOS_SEGMENTACAO = [
  { value: 'comportamento', label: 'Comportamento' },
  { value: 'funil', label: 'Funil' },
  { value: 'demografico', label: 'Demográfico' },
  { value: 'engajamento', label: 'Engajamento' },
  { value: 'personalizado', label: 'Personalizado' },
];

const SITUACOES_MENSAGEM = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'aprovada', label: 'Aprovada' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'falhou', label: 'Falhou' },
];

const SITUACOES_DISPARO = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'lido', label: 'Lido' },
  { value: 'falhou', label: 'Falhou' },
  { value: 'cancelado', label: 'Cancelado' },
];

const TIPOS_CONTRATO = [
  { value: 'recorrente', label: 'Recorrente' },
  { value: 'prazo_fechado', label: 'Prazo fechado' },
];

const SITUACOES_CONTRATO = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'aguardando_assinatura', label: 'Aguardando assinatura' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'suspenso', label: 'Suspenso' },
  { value: 'encerrado', label: 'Encerrado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const PERIODICIDADES = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'unica', label: 'Única' },
];

const CRIADO_ATUALIZADO = [
  { name: 'criado_em', label: 'Criado em', type: 'datetime', readOnly: true } as FieldDef,
  { name: 'atualizado_em', label: 'Atualizado em', type: 'datetime', readOnly: true } as FieldDef,
];

const ID: FieldDef = { name: 'id', label: 'ID', type: 'number', readOnly: true, width: 'xs' };

const itensFields = (fk: string, label: string, ref: string): FieldDef[] => [
  ID,
  { name: fk, label, type: 'text', required: true, ref: { resource: ref, labelField: 'titulo' } },
  { name: 'produto_id', label: 'Produto', type: 'text', required: true, listed: true, ref: { resource: 'produtos', labelField: 'nome' } },
  { name: 'quantidade', label: 'Quantidade', type: 'decimal', scale: 3, listed: true },
  { name: 'preco_unitario', label: 'Preço Unitário', type: 'decimal', scale: 2, listed: true },
  { name: 'desconto', label: 'Desconto (R$)', type: 'decimal', scale: 2, listed: true },
  { name: 'subtotal', label: 'Subtotal', type: 'decimal', scale: 2, listed: true },
];

export const RESOURCES: ResourceDef[] = [
  // ============================================================
  // VENDAS
  // ============================================================
  {
    name: 'negocios',
    table: 'negocios',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Negócios',
    labelSingular: 'Negócio',
    description: 'Oportunidades do funil de vendas',
    icon: 'Handshake',
    group: 'vendas',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'titulo',
    defaultSort: { field: 'criado_em', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [
      { resource: 'atividades', foreignKey: 'negocio_id', label: 'Atividades' },
      { resource: 'propostas', foreignKey: 'negocio_id', label: 'Propostas', totalField: 'valor_total' },
    ],
    fields: [
      ID,
      { name: 'titulo', label: 'Título', type: 'text', required: true, listed: true, searchable: true, maxLength: 255 },
      { name: 'valor', label: 'Valor', type: 'decimal', scale: 2, listed: true, filterable: true },
      { name: 'moeda', label: 'Moeda', type: 'text', maxLength: 3, default: 'BRL', width: 'xs' },
      { name: 'etapa_id', label: 'Funil › Etapa', type: 'text', required: true, listed: true, filterable: true, ref: { resource: 'etapas', labelField: 'nome' } },
      { name: 'funil_id', label: 'Funil', type: 'text', readOnly: true, filterable: true, ref: { resource: 'funis', labelField: 'nome' } },
      { name: 'pessoa_id', label: 'Contato', type: 'text', listed: true, filterable: true, ref: { resource: 'pessoas', labelField: 'nome' } },
      {
        name: 'proprietario_id',
        label: 'Proprietário',
        type: 'text',
        listed: true,
        filterable: true,
        ref: { resource: 'usuarios', labelField: 'nome' },
        hint: 'Em branco na inclusão: fica com quem criou o negócio',
      },
      {
        // Editados no formulário do negócio (server/participantes.ts); aqui só a coluna da lista
        name: 'envolvidos',
        label: 'Envolvidos',
        type: 'text',
        readOnly: true,
        searchable: true,
        sql: `(SELECT GROUP_CONCAT(u.nome ORDER BY u.nome SEPARATOR ', ') FROM negocios_participantes np
                JOIN usuarios u ON u.id = np.usuario_id WHERE np.negocio_id = t.id)`,
      },
      { name: 'status', label: 'Status', type: 'enum', required: true, listed: true, filterable: true, options: STATUS_NEGOCIO },
      { name: 'motivo_perda', label: 'Motivo da Perda', type: 'text', maxLength: 255, disabledWhen: { field: 'status', equals: 'aberto' } },
      { name: 'data_fechamento_esperada', label: 'Fechamento Esperado', type: 'date', listed: true, filterable: true },
      { name: 'data_ganho', label: 'Data do Ganho', type: 'datetime', readOnly: true },
      { name: 'data_perda', label: 'Data da Perda', type: 'datetime', readOnly: true },
      { name: 'data_ultimo_contato', label: 'Último Contato', type: 'datetime', readOnly: true, listed: true },
      { name: 'data_proximo_followup', label: 'Próximo Follow-up', type: 'datetime', readOnly: true, listed: true },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'atividades',
    table: 'atividades',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Atividades',
    labelSingular: 'Atividade',
    description: 'Follow-ups agendados: ligações, reuniões, tarefas e prazos',
    icon: 'CalendarCheck',
    group: 'vendas',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'assunto',
    defaultSort: { field: 'data_vencimento', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    fields: [
      ID,
      { name: 'assunto', label: 'Assunto', type: 'text', required: true, listed: true, searchable: true, maxLength: 255 },
      { name: 'tipo', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_ATIVIDADE, default: 'tarefa' },
      { name: 'data_vencimento', label: 'Vencimento', type: 'date', required: true, listed: true, filterable: true },
      { name: 'hora_vencimento', label: 'Hora', type: 'time', listed: true },
      { name: 'duracao', label: 'Duração', type: 'time', default: '00:15' },
      { name: 'negocio_id', label: 'Negócio', type: 'text', listed: true, filterable: true, ref: { resource: 'negocios', labelField: 'titulo' } },
      { name: 'pessoa_id', label: 'Contato', type: 'text', listed: true, ref: { resource: 'pessoas', labelField: 'nome' } },
      { name: 'concluida', label: 'Concluída', type: 'boolean', listed: true, filterable: true },
      { name: 'concluida_em', label: 'Concluída em', type: 'datetime', readOnly: true },
      { name: 'observacao', label: 'Observação', type: 'textarea' },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'historico_interacoes',
    table: 'historico_interacoes',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Histórico de Interações',
    labelSingular: 'Interação',
    description: 'Linha do tempo: notas, ligações, e-mails, WhatsApp e reuniões realizados',
    icon: 'History',
    group: 'vendas',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'descricao',
    defaultSort: { field: 'criado_em', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    fields: [
      ID,
      { name: 'criado_em', label: 'Data', type: 'datetime', readOnly: true, listed: true },
      { name: 'tipo', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_INTERACAO, default: 'nota' },
      { name: 'descricao', label: 'Descrição', type: 'textarea', required: true, listed: true, searchable: true },
      { name: 'negocio_id', label: 'Negócio', type: 'text', listed: true, filterable: true, ref: { resource: 'negocios', labelField: 'titulo' } },
      { name: 'pessoa_id', label: 'Contato', type: 'text', listed: true, ref: { resource: 'pessoas', labelField: 'nome' } },
      { name: 'proposta_id', label: 'Proposta', type: 'text', ref: { resource: 'propostas', labelField: 'titulo' } },
      { name: 'pedido_id', label: 'Pedido', type: 'text', ref: { resource: 'pedidos', labelField: 'numero_pedido' } },
    ],
  },
  {
    name: 'propostas',
    table: 'propostas',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Propostas',
    labelSingular: 'Proposta',
    description: 'Propostas comerciais com itens do catálogo e controle de versões',
    icon: 'FileSignature',
    group: 'vendas',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'titulo',
    optionsSql: "SELECT id AS value, CONCAT('#', numero_proposta, ' v', versao, ' — ', titulo) AS label FROM propostas WHERE empresa_id = ? ORDER BY numero_proposta DESC LIMIT 1000",
    defaultSort: { field: 'numero_proposta', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [{ resource: 'proposta_itens', foreignKey: 'proposta_id', label: 'Itens da Proposta', totalField: 'subtotal' }],
    // Versões da proposta em árvore: a v1 em cima, as demais como filhas
    arvore: { grupo: 'numero_proposta', ordem: 'versao' },
    fields: [
      ID,
      { name: 'numero_proposta', label: 'Número', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'versao', label: 'Versão', type: 'number', readOnly: true, listed: true, width: 'xs' },
      // Controle livre; padrão AAAA/NNN (+ "-02", "-03"… nas versões), gerado em server/crm.ts
      {
        name: 'qtd_versoes',
        label: 'Versões',
        type: 'number',
        readOnly: true,
        width: 'xs',
        sql: `(SELECT COUNT(*) FROM propostas x WHERE x.empresa_id = t.empresa_id AND x.numero_proposta = t.numero_proposta)`,
      },
      { name: 'controle', label: 'Controle', type: 'text', listed: true, searchable: true, filterable: true, maxLength: 30, width: 'sm' },
      { name: 'titulo', label: 'Título', type: 'text', required: true, listed: true, searchable: true, maxLength: 255 },
      { name: 'negocio_id', label: 'Negócio', type: 'text', required: true, listed: true, filterable: true, ref: { resource: 'negocios', labelField: 'titulo' } },
      { name: 'pessoa_id', label: 'Contato', type: 'text', ref: { resource: 'pessoas', labelField: 'nome' } },
      { name: 'status', label: 'Status', type: 'enum', required: true, listed: true, filterable: true, options: STATUS_PROPOSTA },
      { name: 'valor_subtotal', label: 'Subtotal', type: 'decimal', scale: 2, readOnly: true },
      { name: 'valor_desconto', label: 'Desconto', type: 'decimal', scale: 2, readOnly: true },
      { name: 'valor_total', label: 'Total', type: 'decimal', scale: 2, readOnly: true, listed: true, filterable: true },
      { name: 'validade_dias', label: 'Validade (dias)', type: 'number' },
      { name: 'data_validade', label: 'Válida até', type: 'date', listed: true, filterable: true },
      { name: 'condicoes_pagamento', label: 'Condições de Pagamento', type: 'textarea' },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'proposta_itens',
    table: 'proposta_itens',
    scopeSql: 't.proposta_id IN (SELECT id FROM propostas WHERE empresa_id = ?)',
    label: 'Itens da Proposta',
    labelSingular: 'Item da Proposta',
    description: 'Produtos incluídos em cada proposta',
    icon: 'ListOrdered',
    group: 'vendas',
    oculto: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'produto_id',
    defaultSort: { field: 'criado_em', dir: 'asc' },
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    fields: [...itensFields('proposta_id', 'Proposta', 'propostas'), { name: 'criado_em', label: 'Criado em', type: 'datetime', readOnly: true }],
  },
  {
    name: 'pedidos',
    table: 'pedidos',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Pedidos de Venda',
    labelSingular: 'Pedido',
    description: 'Digitação e fechamento dos pedidos de venda',
    icon: 'ShoppingCart',
    group: 'vendas',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'numero_pedido',
    optionsSql: "SELECT id AS value, CONCAT('Pedido #', numero_pedido) AS label FROM pedidos WHERE empresa_id = ? ORDER BY numero_pedido DESC LIMIT 1000",
    defaultSort: { field: 'numero_pedido', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [{ resource: 'pedido_itens', foreignKey: 'pedido_id', label: 'Itens do Pedido', totalField: 'subtotal' }],
    fields: [
      ID,
      { name: 'numero_pedido', label: 'Número', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'data_emissao', label: 'Emissão', type: 'datetime', readOnly: true, listed: true, filterable: true },
      { name: 'negocio_id', label: 'Negócio', type: 'text', listed: true, filterable: true, ref: { resource: 'negocios', labelField: 'titulo' } },
      { name: 'proposta_id', label: 'Proposta de Origem', type: 'text', ref: { resource: 'propostas', labelField: 'titulo' } },
      { name: 'pessoa_id', label: 'Contato', type: 'text', ref: { resource: 'pessoas', labelField: 'nome' } },
      { name: 'status', label: 'Status', type: 'enum', required: true, listed: true, filterable: true, options: STATUS_PEDIDO },
      { name: 'valor_subtotal', label: 'Subtotal', type: 'decimal', scale: 2, readOnly: true },
      { name: 'valor_desconto', label: 'Desconto', type: 'decimal', scale: 2, readOnly: true },
      { name: 'valor_total', label: 'Total', type: 'decimal', scale: 2, readOnly: true, listed: true, filterable: true },
      { name: 'condicao_pagamento', label: 'Condição de Pagamento', type: 'text', listed: true, maxLength: 100 },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'pedido_itens',
    table: 'pedido_itens',
    scopeSql: 't.pedido_id IN (SELECT id FROM pedidos WHERE empresa_id = ?)',
    label: 'Itens do Pedido',
    labelSingular: 'Item do Pedido',
    description: 'Produtos incluídos em cada pedido',
    icon: 'ListOrdered',
    group: 'vendas',
    oculto: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'produto_id',
    defaultSort: { field: 'criado_em', dir: 'asc' },
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    fields: [...itensFields('pedido_id', 'Pedido', 'pedidos'), { name: 'criado_em', label: 'Criado em', type: 'datetime', readOnly: true }],
  },
  {
    // Totais, documentos, assinatura (D4Sign) e renovação: server/contratos.ts
    name: 'contratos',
    table: 'contratos',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Contratos',
    labelSingular: 'Contrato',
    description: 'Contratos recorrentes e de prazo fechado: vigência, valores, renovação e assinatura eletrônica',
    icon: 'ScrollText',
    group: 'vendas',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'titulo',
    defaultSort: { field: 'numero', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [{ resource: 'contrato_itens', foreignKey: 'contrato_id', label: 'Itens', totalField: 'subtotal', editavel: true }],
    fields: [
      ID,
      { name: 'numero', label: 'Número', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'titulo', label: 'Título', type: 'text', required: true, listed: true, searchable: true, maxLength: 255, span: 3 },
      { name: 'pessoa_id', label: 'Cliente', type: 'text', required: true, listed: true, filterable: true, ref: { resource: 'pessoas', labelField: 'nome' } },
      { name: 'tipo', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_CONTRATO, default: 'recorrente' },
      { name: 'situacao', label: 'Situação', type: 'enum', required: true, listed: true, filterable: true, options: SITUACOES_CONTRATO, default: 'rascunho' },
      {
        // Pelos documentos: via assinada (D4Sign ou anexada como "Assinado") ou envio em andamento
        name: 'assinatura',
        label: 'Assinatura',
        type: 'enum',
        readOnly: true,
        listed: true,
        filterable: true,
        options: [
          { value: 'assinado', label: 'Assinado' },
          { value: 'em_assinatura', label: 'Em assinatura' },
          { value: 'nao_assinado', label: 'Não assinado' },
        ],
        sql: `(CASE WHEN EXISTS (SELECT 1 FROM contrato_documentos d WHERE d.contrato_id = t.id AND (d.assinatura_situacao = 'assinado' OR d.tipo = 'assinado')) THEN 'assinado'
                    WHEN EXISTS (SELECT 1 FROM contrato_documentos d WHERE d.contrato_id = t.id AND d.assinatura_situacao IN ('enviado', 'visualizado')) THEN 'em_assinatura'
                    ELSE 'nao_assinado' END)`,
      },
      {
        // Andamento do último envio à D4Sign: signatários que já assinaram de quantos há
        name: 'assinaturas',
        label: 'Assinaturas',
        type: 'text',
        readOnly: true,
        listed: true,
        sql: `(SELECT CONCAT((SELECT COUNT(*) FROM JSON_TABLE(d.signatarios, '$[*]' COLUMNS (a BOOLEAN PATH '$.assinado')) j WHERE j.a),
                             ' de ', JSON_LENGTH(d.signatarios))
                 FROM contrato_documentos d
                WHERE d.contrato_id = t.id AND d.assinatura_situacao IN ('enviado', 'visualizado', 'assinado') AND JSON_LENGTH(d.signatarios) > 0
                ORDER BY d.assinatura_enviada_em DESC, d.id DESC LIMIT 1)`,
      },
      {
        // Quando a via assinada chegou ao CRM (a D4Sign finaliza só depois do último signatário)
        name: 'assinado_em',
        label: 'Assinado em',
        type: 'date',
        readOnly: true,
        listed: true,
        filterable: true,
        sql: `(SELECT DATE(MAX(COALESCE(d.assinatura_concluida_em, d.criado_em))) FROM contrato_documentos d
                WHERE d.contrato_id = t.id AND (d.assinatura_situacao = 'assinado' OR d.tipo = 'assinado'))`,
      },
      { name: 'data_inicio', label: 'Início', type: 'date', required: true, listed: true, filterable: true },
      { name: 'data_fim', label: 'Fim', type: 'date', listed: true, filterable: true, hint: 'Em branco: prazo indeterminado' },
      { name: 'periodicidade', label: 'Periodicidade', type: 'enum', required: true, listed: true, options: PERIODICIDADES, default: 'mensal' },
      { name: 'dia_vencimento', label: 'Dia de vencimento', type: 'number', width: 'xs' },
      { name: 'valor_periodo', label: 'Valor por período', type: 'decimal', scale: 2, readOnly: true, listed: true, hint: 'Soma dos itens' },
      { name: 'valor_total', label: 'Valor total', type: 'decimal', scale: 2, readOnly: true, listed: true, hint: 'Da vigência (sem fim: 12 meses)' },
      { name: 'renovacao_automatica', label: 'Renovação automática', type: 'boolean', listed: true, default: true, hint: 'Vencido, renova por 12 meses; sem ela, encerra' },
      { name: 'aviso_renovacao_dias', label: 'Aviso de renovação (dias)', type: 'number', default: 60, hint: 'Cria a tarefa "Renovar contrato" antes do fim' },
      { name: 'indice_reajuste', label: 'Índice de reajuste', type: 'text', maxLength: 20, placeholder: 'IPCA, IGP-M…' },
      { name: 'data_proximo_reajuste', label: 'Próximo reajuste', type: 'date' },
      { name: 'negocio_id', label: 'Negócio', type: 'text', filterable: true, ref: { resource: 'negocios', labelField: 'titulo' } },
      { name: 'proposta_id', label: 'Proposta', type: 'text', ref: { resource: 'propostas', labelField: 'titulo' } },
      { name: 'proprietario_id', label: 'Responsável', type: 'text', listed: true, filterable: true, ref: { resource: 'usuarios', labelField: 'nome' } },
      { name: 'motivo_encerramento', label: 'Motivo do encerramento', type: 'text', maxLength: 255, disabledWhen: { field: 'situacao', equals: 'ativo' } },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      { name: 'cod_integracao', label: 'Cód.Integração', type: 'text', maxLength: 50, hint: 'Código no sistema de gestão' },
      { name: 'encerrado_em', label: 'Encerrado em', type: 'datetime', readOnly: true },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    // Editados no painel de detalhe do contrato; subtotal e totais calculados pelo servidor
    name: 'contrato_itens',
    table: 'contrato_itens',
    scopeSql: 't.contrato_id IN (SELECT id FROM contratos WHERE empresa_id = ?)',
    label: 'Itens do Contrato',
    labelSingular: 'Item do Contrato',
    description: 'Produtos e licenças do contrato',
    icon: 'ListOrdered',
    group: 'vendas',
    oculto: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'id',
    defaultSort: { field: 'id', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    fields: [
      ID,
      { name: 'contrato_id', label: 'Contrato', type: 'text', required: true, ref: { resource: 'contratos', labelField: 'titulo' } },
      { name: 'produto_id', label: 'Produto', type: 'text', required: true, listed: true, ref: { resource: 'produtos', labelField: 'nome' } },
      { name: 'quantidade', label: 'Quantidade', type: 'decimal', scale: 3, required: true, listed: true, default: '1.000' },
      { name: 'preco_unitario', label: 'Valor por período', type: 'decimal', scale: 2, listed: true, hint: 'Em branco: preço de tabela do produto' },
      { name: 'desconto', label: 'Desconto (R$)', type: 'decimal', scale: 2, listed: true },
      { name: 'subtotal', label: 'Subtotal', type: 'decimal', scale: 2, readOnly: true, listed: true },
      { name: 'criado_em', label: 'Criado em', type: 'datetime', readOnly: true },
    ],
  },

  // ============================================================
  // CADASTROS
  // ============================================================
  {
    name: 'empresas',
    table: 'empresas',
    scopeSql: 't.id = ?',
    label: 'Minha Empresa',
    labelSingular: 'Empresa',
    description: 'Dados da empresa logada (impressos nas propostas e pedidos)',
    icon: 'Building2',
    group: 'cadastros',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    canCreate: false,
    canUpdate: true,
    canDelete: false,
    fields: [
      ID,
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 255 },
      { name: 'cnpj', label: 'CNPJ', type: 'cnpj', listed: true, searchable: true },
      { name: 'endereco', label: 'Endereço', type: 'textarea', listed: true, searchable: true },
      { name: 'logo', label: 'Logo', type: 'imagem', hint: 'Aparece no cabeçalho da impressão de propostas e pedidos' },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'pessoas',
    table: 'pessoas',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Pessoas',
    labelSingular: 'Pessoa',
    description: 'Contatos dos leads e clientes',
    icon: 'Users',
    group: 'cadastros',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [
      { resource: 'negocios', foreignKey: 'pessoa_id', label: 'Negócios', totalField: 'valor' },
      { resource: 'atividades', foreignKey: 'pessoa_id', label: 'Atividades' },
      { resource: 'pessoas_enderecos', foreignKey: 'pessoa_id', label: 'Endereços' },
    ],
    fields: [
      ID,
      { name: 'tipo', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_PESSOA, default: 'lead', width: 'xs', span: 1 },
      // Tipo + Nome dividem a primeira linha do formulário (grade de 4 colunas)
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 255, span: 3 },
      { name: 'segmento_id', label: 'Segmento', type: 'text', listed: true, filterable: true, ref: { resource: 'segmentos', labelField: 'nome' } },
      { name: 'email', label: 'E-mail', type: 'text', listed: true, searchable: true, maxLength: 255 },
      { name: 'telefone', label: 'Telefone', type: 'text', listed: true, searchable: true, maxLength: 50 },
      { name: 'cpf', label: 'CPF', type: 'text', searchable: true, maxLength: 14, placeholder: '000.000.000-00' },
      { name: 'obs', label: 'Observação', type: 'textarea' },
      { name: 'personalizados', label: 'Campos Personalizados', type: 'personalizados' },
      { name: 'cod_integracao', label: 'Cód.Integração', type: 'text', readOnly: true, listed: true, filterable: true, searchable: true, hint: 'Preenchido pela importação do bmsoft (PESSOAS.ID)' },
      {
        name: 'cidade_uf',
        label: 'Cidade/UF',
        type: 'text',
        readOnly: true,
        listed: true,
        searchable: true,
        filterable: true,
        // Do endereço principal (ou do primeiro, se nenhum estiver marcado)
        sql: `(SELECT NULLIF(CONCAT_WS(' / ', e.cidade, e.uf), '') FROM pessoas_enderecos e
                WHERE e.pessoa_id = t.id ORDER BY e.principal DESC, e.id LIMIT 1)`,
      },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    // Endereços são editados no próprio cadastro da pessoa (server/enderecos.ts);
    // este recurso só alimenta o painel de detalhe da lista
    name: 'pessoas_enderecos',
    table: 'pessoas_enderecos',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Endereços',
    labelSingular: 'Endereço',
    description: 'Endereços das pessoas',
    icon: 'MapPin',
    group: 'cadastros',
    oculto: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'logradouro',
    defaultSort: { field: 'id', dir: 'asc' },
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    fields: [
      ID,
      // sem ref: o painel já está na pessoa e o combo carregaria todas as pessoas à toa
      { name: 'pessoa_id', label: 'Pessoa', type: 'number' },
      { name: 'tipo', label: 'Tipo', type: 'enum', listed: true, options: TIPOS_ENDERECO },
      { name: 'principal', label: 'Principal', type: 'boolean', listed: true },
      { name: 'cep', label: 'CEP', type: 'text', listed: true },
      { name: 'logradouro', label: 'Logradouro', type: 'text', listed: true },
      { name: 'numero', label: 'Número', type: 'text', listed: true },
      { name: 'complemento', label: 'Complemento', type: 'text', listed: true },
      { name: 'bairro', label: 'Bairro', type: 'text', listed: true },
      { name: 'cidade', label: 'Cidade', type: 'text', listed: true },
      { name: 'uf', label: 'UF', type: 'text', listed: true },
      { name: 'codigo_ibge', label: 'Cód. IBGE', type: 'text' },
      { name: 'pais', label: 'País', type: 'text' },
      { name: 'obs', label: 'Observação', type: 'text', listed: true },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'segmentos',
    table: 'segmentos',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Segmentos',
    labelSingular: 'Segmento',
    description: 'Segmentação das pessoas: grupos usados para filtrar e direcionar o atendimento',
    icon: 'Tags',
    group: 'cadastros',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    // Os inativos também vêm (senão a lista de pessoas mostraria "…" no lugar do nome),
    // marcados e no fim do combo
    optionsSql: `SELECT id AS value, CONCAT(nome, IF(ativo = 1, '', ' (inativo)')) AS label
                   FROM segmentos WHERE empresa_id = ? ORDER BY ativo DESC, nome LIMIT 1000`,
    defaultSort: { field: 'nome', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [{ resource: 'pessoas', foreignKey: 'segmento_id', label: 'Pessoas do Segmento' }],
    fields: [
      ID,
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 100 },
      { name: 'descricao', label: 'Descrição', type: 'text', listed: true, searchable: true, maxLength: 255, span: 3 },
      { name: 'ativo', label: 'Ativo', type: 'boolean', listed: true, filterable: true, default: true, width: 'xs' },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'produtos',
    table: 'produtos',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Produtos',
    labelSingular: 'Produto',
    description: 'Catálogo de produtos e serviços com preço de tabela',
    icon: 'Package',
    group: 'cadastros',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    fields: [
      ID,
      { name: 'codigo_sku', label: 'SKU', type: 'text', listed: true, searchable: true, maxLength: 50, width: 'sm' },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 255 },
      { name: 'descricao', label: 'Descrição', type: 'textarea', searchable: true },
      { name: 'preco_tabela', label: 'Preço de Tabela', type: 'decimal', scale: 2, required: true, listed: true, filterable: true },
      { name: 'unidade_medida', label: 'Unidade', type: 'text', maxLength: 10, listed: true, default: 'UN', width: 'xs' },
      { name: 'ativo', label: 'Ativo', type: 'boolean', listed: true, filterable: true },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'funis',
    table: 'funis',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Funis de Vendas',
    labelSingular: 'Funil',
    description: 'Pipelines de vendas',
    icon: 'Filter',
    group: 'cadastros',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    defaultSort: { field: 'ordem', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    // Etapas não têm menu próprio: são mantidas aqui, no detalhe do funil
    details: [{ resource: 'etapas', foreignKey: 'funil_id', label: 'Etapas', editavel: true }],
    fields: [
      ID,
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 100 },
      { name: 'ordem', label: 'Ordem', type: 'number', listed: true, width: 'xs' },
      { name: 'ativo', label: 'Ativo', type: 'boolean', listed: true, filterable: true },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'etapas',
    table: 'etapas',
    scopeSql: 't.funil_id IN (SELECT id FROM funis WHERE empresa_id = ?)',
    label: 'Etapas do Funil',
    labelSingular: 'Etapa',
    description: 'Colunas do Kanban de cada funil',
    icon: 'Columns3',
    group: 'cadastros',
    oculto: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    optionsSql:
      "SELECT e.id AS value, CONCAT(f.nome, ' › ', e.nome) AS label FROM etapas e JOIN funis f ON f.id = e.funil_id WHERE f.empresa_id = ? ORDER BY f.ordem, f.nome, e.ordem LIMIT 1000",
    defaultSort: { field: 'ordem', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    fields: [
      ID,
      { name: 'funil_id', label: 'Funil', type: 'text', required: true, listed: true, filterable: true, ref: { resource: 'funis', labelField: 'nome' } },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 100 },
      { name: 'ordem', label: 'Ordem', type: 'number', listed: true, width: 'xs' },
      { name: 'probabilidade', label: 'Probabilidade (%)', type: 'decimal', scale: 2, listed: true, default: '100.00' },
      ...CRIADO_ATUALIZADO,
    ],
  },

  // ============================================================
  // MARKETING (campanhas: server/campanhas.ts)
  // ============================================================
  {
    name: 'campanhas',
    table: 'campanhas',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ? AND t.excluida_em IS NULL',
    exclusaoLogica: 'excluida_em',
    label: 'Campanhas',
    labelSingular: 'Campanha',
    description: 'Campanhas de relacionamento: segmentos, mensagens personalizadas e disparos',
    icon: 'Megaphone',
    group: 'marketing',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    defaultSort: { field: 'id', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [
      { resource: 'campanha_segmentos', foreignKey: 'campanha_id', label: 'Segmentos' },
      { resource: 'campanha_mensagens', foreignKey: 'campanha_id', label: 'Mensagens' },
    ],
    fields: [
      ID,
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 150 },
      { name: 'objetivo', label: 'Objetivo', type: 'enum', required: true, listed: true, filterable: true, options: OBJETIVOS_CAMPANHA, default: 'conversao' },
      { name: 'canal', label: 'Canal', type: 'enum', required: true, listed: true, filterable: true, options: CANAIS_CAMPANHA, default: 'email' },
      { name: 'situacao', label: 'Situação', type: 'enum', required: true, listed: true, filterable: true, options: SITUACOES_CAMPANHA, default: 'rascunho' },
      { name: 'descricao', label: 'Descrição', type: 'textarea', searchable: true },
      {
        name: 'qtd_disparos',
        label: 'Disparos',
        type: 'number',
        readOnly: true,
        listed: true,
        width: 'xs',
        sql: '(SELECT COUNT(*) FROM disparos_mensagens d JOIN campanha_mensagens m ON m.id = d.mensagem_id WHERE m.campanha_id = t.id)',
      },
      {
        name: 'qtd_pendentes',
        label: 'Pendentes',
        type: 'number',
        readOnly: true,
        listed: true,
        width: 'xs',
        sql: "(SELECT COUNT(*) FROM disparos_mensagens d JOIN campanha_mensagens m ON m.id = d.mensagem_id WHERE m.campanha_id = t.id AND d.situacao = 'pendente')",
      },
      { name: 'iniciada_em', label: 'Iniciada em', type: 'datetime', readOnly: true, listed: true, filterable: true },
      { name: 'encerrada_em', label: 'Encerrada em', type: 'datetime', readOnly: true, listed: true },
      { name: 'criada_por', label: 'Criada por', type: 'text', readOnly: true, ref: { resource: 'usuarios', labelField: 'nome' } },
      { name: 'criada_em', label: 'Criada em', type: 'datetime', readOnly: true },
      { name: 'atualizada_em', label: 'Atualizada em', type: 'datetime', readOnly: true },
    ],
  },
  {
    name: 'campanha_segmentos',
    table: 'campanha_segmentos',
    scopeSql: 't.campanha_id IN (SELECT id FROM campanhas WHERE empresa_id = ? AND excluida_em IS NULL)',
    label: 'Segmentos de Campanha',
    labelSingular: 'Segmento de Campanha',
    description: 'Público das campanhas, recalculado pelos critérios ao gravar e ao gerar os disparos',
    icon: 'Target',
    group: 'marketing',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    optionsSql: `SELECT s.id AS value, CONCAT(c.nome, ' › ', s.nome) AS label
                   FROM campanha_segmentos s JOIN campanhas c ON c.id = s.campanha_id
                  WHERE c.empresa_id = ? AND c.excluida_em IS NULL ORDER BY c.nome, s.nome LIMIT 1000`,
    defaultSort: { field: 'id', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [{ resource: 'campanha_segmento_pessoas', foreignKey: 'segmento_id', label: 'Pessoas do Segmento' }],
    fields: [
      ID,
      { name: 'campanha_id', label: 'Campanha', type: 'text', required: true, listed: true, filterable: true, ref: { resource: 'campanhas', labelField: 'nome' } },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 150 },
      { name: 'tipo_segmentacao', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_SEGMENTACAO, default: 'comportamento' },
      { name: 'tamanho_estimado', label: 'Pessoas', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'criterios', label: 'Critérios', type: 'criterios', required: true, hint: 'A pessoa entra no segmento quando atende a todos os critérios' },
      { name: 'criada_em', label: 'Criado em', type: 'datetime', readOnly: true },
      { name: 'atualizada_em', label: 'Atualizado em', type: 'datetime', readOnly: true },
    ],
  },
  {
    // Preenchido pelo cálculo do segmento (server/campanhas.ts): só leitura
    name: 'campanha_segmento_pessoas',
    table: 'campanha_segmento_pessoas',
    scopeSql: 't.segmento_id IN (SELECT s.id FROM campanha_segmentos s JOIN campanhas c ON c.id = s.campanha_id WHERE c.empresa_id = ?)',
    label: 'Pessoas do Segmento',
    labelSingular: 'Pessoa do Segmento',
    description: 'Público calculado do segmento',
    icon: 'Users',
    group: 'marketing',
    oculto: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'id',
    defaultSort: { field: 'pessoa_nome', dir: 'asc' },
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    fields: [
      ID,
      { name: 'segmento_id', label: 'Segmento', type: 'number' },
      // sem ref: o combo carregaria todas as pessoas à toa
      { name: 'pessoa_id', label: 'Pessoa', type: 'number' },
      { name: 'pessoa_nome', label: 'Pessoa', type: 'text', readOnly: true, listed: true, sql: '(SELECT nome FROM pessoas WHERE id = t.pessoa_id)' },
      { name: 'pessoa_email', label: 'E-mail', type: 'text', readOnly: true, listed: true, sql: '(SELECT email FROM pessoas WHERE id = t.pessoa_id)' },
      { name: 'pessoa_telefone', label: 'Telefone', type: 'text', readOnly: true, listed: true, sql: '(SELECT telefone FROM pessoas WHERE id = t.pessoa_id)' },
      { name: 'adicionado_em', label: 'Adicionado em', type: 'datetime', readOnly: true, listed: true },
    ],
  },
  {
    name: 'campanha_mensagens',
    table: 'campanha_mensagens',
    scopeSql: 't.campanha_id IN (SELECT id FROM campanhas WHERE empresa_id = ? AND excluida_em IS NULL)',
    label: 'Mensagens de Campanha',
    labelSingular: 'Mensagem de Campanha',
    description: 'Textos das campanhas com variáveis ({{nome}}); só as aprovadas geram disparos',
    icon: 'MessageSquareText',
    group: 'marketing',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'assunto',
    defaultSort: { field: 'id', dir: 'desc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    details: [{ resource: 'disparos_mensagens', foreignKey: 'mensagem_id', label: 'Disparos' }],
    fields: [
      ID,
      { name: 'campanha_id', label: 'Campanha', type: 'text', required: true, listed: true, filterable: true, ref: { resource: 'campanhas', labelField: 'nome' } },
      {
        name: 'segmento_id',
        label: 'Segmento',
        type: 'text',
        listed: true,
        filterable: true,
        ref: { resource: 'campanha_segmentos', labelField: 'nome' },
        hint: 'Em branco: todos os segmentos da campanha',
      },
      { name: 'assunto', label: 'Assunto', type: 'text', listed: true, searchable: true, maxLength: 255 },
      {
        name: 'corpo',
        label: 'Mensagem',
        type: 'textarea',
        required: true,
        searchable: true,
        hint: 'Variáveis: {{nome}}, {{primeiro_nome}}, {{email}}, {{telefone}}, {{cidade}}, {{ultima_compra}}, {{empresa}}',
      },
      { name: 'atraso_minutos', label: 'Atraso (min)', type: 'number', listed: true, width: 'xs', default: 0, hint: 'Contado a partir da geração dos disparos' },
      { name: 'situacao', label: 'Situação', type: 'enum', required: true, listed: true, filterable: true, options: SITUACOES_MENSAGEM, default: 'rascunho' },
      {
        name: 'qtd_disparos',
        label: 'Disparos',
        type: 'number',
        readOnly: true,
        listed: true,
        width: 'xs',
        sql: '(SELECT COUNT(*) FROM disparos_mensagens d WHERE d.mensagem_id = t.id)',
      },
      { name: 'criada_em', label: 'Criada em', type: 'datetime', readOnly: true },
      { name: 'atualizada_em', label: 'Atualizada em', type: 'datetime', readOnly: true },
    ],
  },
  {
    // Gerados pela campanha (server/campanhas.ts); a situação muda pelo processo de envio
    name: 'disparos_mensagens',
    table: 'disparos_mensagens',
    scopeSql: `t.mensagem_id IN (SELECT m.id FROM campanha_mensagens m JOIN campanhas c ON c.id = m.campanha_id
                                  WHERE c.empresa_id = ? AND c.excluida_em IS NULL)`,
    label: 'Disparos',
    labelSingular: 'Disparo',
    description: 'Fila de envio das mensagens de campanha, por pessoa',
    icon: 'Send',
    group: 'marketing',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'id',
    defaultSort: { field: 'agendado_para', dir: 'desc' },
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    fields: [
      ID,
      { name: 'mensagem_id', label: 'Mensagem', type: 'number', filterable: true },
      {
        name: 'campanha_nome',
        label: 'Campanha',
        type: 'text',
        readOnly: true,
        listed: true,
        searchable: true,
        filterable: true,
        sql: '(SELECT c.nome FROM campanha_mensagens m JOIN campanhas c ON c.id = m.campanha_id WHERE m.id = t.mensagem_id)',
      },
      { name: 'pessoa_id', label: 'Pessoa', type: 'number' },
      { name: 'pessoa_nome', label: 'Pessoa', type: 'text', readOnly: true, listed: true, searchable: true, sql: '(SELECT nome FROM pessoas WHERE id = t.pessoa_id)' },
      { name: 'situacao', label: 'Situação', type: 'enum', listed: true, filterable: true, options: SITUACOES_DISPARO },
      { name: 'agendado_para', label: 'Agendado para', type: 'datetime', listed: true, filterable: true },
      { name: 'enviado_em', label: 'Enviado em', type: 'datetime', listed: true },
      { name: 'entregue_em', label: 'Entregue em', type: 'datetime' },
      { name: 'lido_em', label: 'Lido em', type: 'datetime', listed: true },
      { name: 'mensagem_erro', label: 'Erro', type: 'text', listed: true },
    ],
  },

  // ============================================================
  // ACESSO
  // ============================================================
  {
    name: 'usuarios',
    table: 'usuarios',
    tenantColumn: 'empresa_id',
    scopeSql: 't.empresa_id = ?',
    label: 'Usuários',
    labelSingular: 'Usuário',
    description: 'Quem acessa o CRM',
    icon: 'KeyRound',
    group: 'acesso',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    // Combos de proprietário/envolvidos: os inativos vêm marcados e no fim, para as
    // listas continuarem mostrando o nome de quem saiu
    optionsSql: `SELECT id AS value, CONCAT(nome, IF(ativo = 1, '', ' (inativo)')) AS label
                   FROM usuarios WHERE empresa_id = ? ORDER BY ativo DESC, nome LIMIT 1000`,
    defaultSort: { field: 'nome', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    fields: [
      { name: 'id', label: 'ID', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 150 },
      { name: 'email', label: 'E-mail', type: 'text', required: true, listed: true, searchable: true, maxLength: 150 },
      { name: 'senha_hash', label: 'Senha', type: 'password', hint: 'Em branco na inclusão: a senha é definida no primeiro acesso' },
      { name: 'cargo', label: 'Cargo', type: 'text', listed: true, maxLength: 80 },
      { name: 'tipo', label: 'Perfil', type: 'enum', required: true, listed: true, options: [{ value: 'admin', label: 'Administrador' }, { value: 'client', label: 'Vendedor' }], default: 'client' },
      { name: 'ativo', label: 'Ativo', type: 'boolean', listed: true, filterable: true },
      { name: 'created_at', label: 'Criado em', type: 'datetime', readOnly: true },
    ],
  },
];

export const RESOURCE_MAP: Record<string, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.name, r]),
);

export function getResource(name: string): ResourceDef | null {
  return Object.prototype.hasOwnProperty.call(RESOURCE_MAP, name) ? RESOURCE_MAP[name] : null;
}

/** Colunas graváveis: exclui readOnly, a PK e a coluna do tenant (esta vem da sessão) */
export function writableFields(resource: ResourceDef): FieldDef[] {
  return resource.fields.filter((f) => !f.readOnly && !resource.pk.includes(f.name) && f.name !== resource.tenantColumn);
}

/** Expressão SQL da coluna: a própria coluna da tabela ou a expressão da coluna calculada */
export function colunaSql(resource: ResourceDef, nome: string): string {
  return resource.fields.find((f) => f.name === nome)?.sql ?? `t.${nome}`;
}

/** Todas as colunas conhecidas — whitelist de ordenação e filtros */
export function columnNames(resource: ResourceDef): string[] {
  return resource.fields.map((f) => f.name);
}
