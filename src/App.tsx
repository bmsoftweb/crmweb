import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Usuario, ResourceDef, DbConnectionStatus, DashboardData, RegistroCrud } from './types';
import { fetchContagemChamados,
  setTokenSessao,
  setAoExpirarSessao,
  fetchResources,
  fetchDbStatus,
  fetchDashboard,
  invalidateOptions,
  validarSessao,
  fetchNaoVistas,
} from './services/api';
import { destravarSom, tocarAviso } from './utils/som';
import { limparConfigListas } from './utils/configListas';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { Dashboard } from './components/Dashboard';
import { CrudView } from './components/CrudView';
import { Kanban } from './components/Kanban';
import { NegocioFicha } from './components/NegocioFicha';
import { DocumentoEditor } from './components/DocumentoEditor';
import { BotaoImportarBM } from './components/ImportarBMModal';
import { BotaoImportarArquivo } from './components/ImportarArquivoModal';
import { BotaoClonar } from './components/BotaoClonar';
import { BotaoImprimir } from './components/BotaoImprimir';
import { AcaoCampanha } from './components/AcoesCampanha';
import { BotaoEnviar } from './components/BotaoEnviar';
import { BotaoLinkAceite } from './components/BotaoLinkAceite';
import { BotaoNovaVersao } from './components/BotaoNovaVersao';
import { ContratoDocumentos } from './components/ContratoDocumentos';
import { BotaoGerarContrato } from './components/BotaoGerarContrato';
import { ConfiguracoesView } from './components/ConfiguracoesView';
import { ConversasView, PedidoConversa } from './components/ConversasView';
import { ChamadosAtivos, ChamadosFila } from './components/Chamados';
import { BotaoWhatsApp } from './components/BotaoWhatsApp';
import { BotaoPermissoes } from './components/PermissoesUsuario';
import { gruposDoMenu, podeAcessar } from './utils/menu';
import { ThemeMode, getInitialTheme, applyTheme } from './utils/theme';
import { Sessao, lerSessao, salvarSessao, limparSessao } from './utils/session';

export default function App() {
  // ----------------------------------------------------------
  // Tema claro / escuro
  // ----------------------------------------------------------
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const handleToggleTheme = useCallback(() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

  // ----------------------------------------------------------
  // Sessão (token assinado pelo servidor, guardado no navegador)
  // ----------------------------------------------------------
  const [sessao, setSessao] = useState<Sessao | null>(() => {
    const s = lerSessao();
    // O token precisa estar no cliente HTTP antes da primeira chamada
    setTokenSessao(s?.token ?? null);
    return s;
  });
  const usuario: Usuario | null = sessao?.usuario ?? null;

  // ----------------------------------------------------------
  // Navegação e estado geral
  // ----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<string>('kanban');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [resources, setResources] = useState<ResourceDef[]>([]);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const [createToken, setCreateToken] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  /** Mensagens do WhatsApp recebidas e ainda não vistas (etiqueta do menu Conversas) */
  const [naoVistas, setNaoVistas] = useState(0);
  /** Chamados aguardando na fila (etiqueta do menu) e o chamado a abrir em Chamados Ativos */
  const [filaChamados, setFilaChamados] = useState(0);
  const [chamadoAbrir, setChamadoAbrir] = useState<number | null>(null);
  /** Conversas passadas ao meu departamento que já tocaram o aviso (telefone + quando) */
  const avisadasRef = useRef(new Set<string>());
  /** Última conversa transferida para mim já avisada (null = ainda não carregou: sem campainha na abertura) */
  const ultimaTransferidaWa = useRef<number | null>(null);
  const atualizarNaoVistas = useCallback(() => {
    fetchNaoVistas()
      .then((r) => {
        setNaoVistas(r.total);
        // Cliente encaminhado ao meu departamento: aviso sonoro em qualquer tela, uma vez por encaminhamento
        const novas = (r.encaminhadas ?? []).filter((e) => !avisadasRef.current.has(`${e.telefone}|${e.desde}`));
        novas.forEach((e) => avisadasRef.current.add(`${e.telefone}|${e.desde}`));
        if (novas.length) {
          tocarAviso('campainha');
          const e = novas[0];
          showToast(`${e.nome || `+${e.telefone}`} aguardando atendimento no ${e.departamento}${novas.length > 1 ? ` (e mais ${novas.length - 1})` : ''}. Veja em Conversas.`);
        }
        // Conversa transferida para mim: a mesma campainha dos chamados
        const tr = r.transferida;
        if (tr && ultimaTransferidaWa.current !== null && tr.id > ultimaTransferidaWa.current) {
          tocarAviso('campainha');
          showToast(`Conversa de ${tr.nome || `+${tr.telefone}`} transferida para você${tr.de ? ` por ${tr.de}` : ''}. Veja no Whatsapp.`);
          setRefreshToken((t) => t + 1);
        }
        ultimaTransferidaWa.current = Math.max(ultimaTransferidaWa.current ?? 0, tr?.id ?? 0);
      })
      .catch(() => {}); // sem a tabela ou sem conexão: fica sem etiqueta
  }, [showToast]);
  useEffect(() => destravarSom(), []);
  // Sem permissão para Conversas: sem etiqueta de não vistas nem aviso sonoro
  const veConversas = podeAcessar(sessao?.usuario ?? null, 'conversas');
  useEffect(() => {
    if (!sessao || !veConversas) return;
    atualizarNaoVistas();
    // Também com a aba em segundo plano: o aviso sonoro não pode esperar a pessoa voltar
    const i = setInterval(atualizarNaoVistas, 15_000);
    return () => clearInterval(i);
  }, [sessao, veConversas, atualizarNaoVistas]);

  // Etiqueta da Fila de Chamados, para quem trabalha os chamados
  const veChamados = podeAcessar(sessao?.usuario ?? null, 'chamados_fila') || podeAcessar(sessao?.usuario ?? null, 'chamados_ativos');
  /** Última mensagem de cliente já vista nos meus chamados (null = ainda não carregou: sem som na abertura) */
  const ultimaMsgChamado = useRef<number | null>(null);
  const ultimoChamadoFila = useRef<number | null>(null);
  /** Última transferência de chamado para mim já avisada (null = ainda não carregou: sem campainha na abertura) */
  const ultimaTransferencia = useRef<number | null>(null);
  /** Idem, para chamado transferido para o meu departamento */
  const ultimaTransferenciaDep = useRef<number | null>(null);
  /** Acabou de entrar (login ou sessão guardada): quem é do Suporte começa na Fila de Chamados */
  const recemEntrou = useRef(true);
  const atualizarFilaChamados = useCallback(() => {
    fetchContagemChamados()
      .then((r) => {
        setFilaChamados(r.fila);
        if (recemEntrou.current) {
          recemEntrou.current = false;
          // Só se ainda está na tela inicial (não tira o usuário de onde ele já foi)
          if (r.suporte) setActiveTab((t) => (t === 'kanban' ? 'chamados_fila' : t));
        }
        const m = r.mensagem;
        // Cliente escreveu num chamado meu: aviso sonoro, aviso na tela e a conversa aberta se atualiza
        if (m && ultimaMsgChamado.current !== null && m.id > ultimaMsgChamado.current) {
          tocarAviso('suporte');
          showToast(`Nova mensagem de ${m.nome || 'cliente'} no chamado nº ${m.numero}.`);
          setRefreshToken((t) => t + 1);
        }
        ultimaMsgChamado.current = Math.max(ultimaMsgChamado.current ?? 0, m?.id ?? 0);
        // Chamado novo na fila: aviso com som próprio para quem é do departamento Suporte
        const n = r.novo;
        if (r.suporte && n && ultimoChamadoFila.current !== null && n.id > ultimoChamadoFila.current) {
          tocarAviso('chamado');
          showToast(`Novo chamado nº ${n.numero} na fila${n.nome ? ` (${n.nome})` : ''}.`);
        }
        ultimoChamadoFila.current = Math.max(ultimoChamadoFila.current ?? 0, n?.id ?? 0);
        // Chamado transferido para mim: campainha, aviso na tela e as listas se atualizam
        const tr = r.transferido;
        if (tr && ultimaTransferencia.current !== null && tr.id > ultimaTransferencia.current) {
          tocarAviso('campainha');
          showToast(`Chamado nº ${tr.numero}${tr.nome ? ` (${tr.nome})` : ''} transferido para você${tr.de ? ` por ${tr.de}` : ''}.`);
          setRefreshToken((t) => t + 1);
        }
        ultimaTransferencia.current = Math.max(ultimaTransferencia.current ?? 0, tr?.id ?? 0);
        // Chamado transferido para o meu departamento (voltou para a fila): a mesma campainha
        const td = r.transferido_departamento;
        if (td && ultimaTransferenciaDep.current !== null && td.id > ultimaTransferenciaDep.current) {
          tocarAviso('campainha');
          showToast(`Chamado nº ${td.numero}${td.nome ? ` (${td.nome})` : ''} transferido para o ${td.departamento}${td.de ? ` por ${td.de}` : ''}. Veja na Fila de Chamados.`);
          setRefreshToken((t) => t + 1);
        }
        ultimaTransferenciaDep.current = Math.max(ultimaTransferenciaDep.current ?? 0, td?.id ?? 0);
      })
      .catch(() => {}); // sem as tabelas ou sem conexão: fica sem etiqueta
  }, [showToast]);
  useEffect(() => {
    if (!sessao || !veChamados) return;
    atualizarFilaChamados();
    // A cada 5 s: o aviso de mensagem do cliente não pode demorar (é uma consulta pequena)
    const i = setInterval(atualizarFilaChamados, 5_000);
    return () => clearInterval(i);
  }, [sessao, veChamados, atualizarFilaChamados]);

  // Tela sem permissão (ex.: o Funil, que abre primeiro): vai para a primeira opção do menu que o usuário acessa
  useEffect(() => {
    const u = sessao?.usuario ?? null;
    if (!u || !resources.length) return;
    const ids = gruposDoMenu(resources).flatMap((g) => g.itens.map((i) => i.id));
    if ((ids.includes(activeTab) || activeTab === 'usuarios') && !podeAcessar(u, activeTab)) {
      const primeira = ids.find((id) => podeAcessar(u, id));
      if (primeira) setActiveTab(primeira);
    }
  }, [sessao, resources, activeTab]);

  /** Atividade WhatsApp clicada na ficha do negócio: a tela Conversas abre o número do cliente */
  const [pedidoConversa, setPedidoConversa] = useState<PedidoConversa | null>(null);

  /** Motivo exibido na tela de login quando a sessão é recusada */
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);

  /** Troca de tela; o gatilho do botão "Novo" zera para a tela nova não abrir uma inclusão sozinha */
  const navegar = useCallback((tab: string) => {
    setCreateToken(0);
    setActiveTab(tab);
  }, []);

  /** Abre a tela Conversas no número de uma atividade WhatsApp, de uma pessoa ou de um contato */
  const pedirConversa = useCallback(
    (de: Omit<PedidoConversa, 'seq'>) => {
      setPedidoConversa({ ...de, seq: Date.now() });
      navegar('conversas');
    },
    [navegar],
  );

  const handleLogout = useCallback(() => {
    setSessao(null);
    setResources([]);
    setDashboard(null);
    setRecordCounts({});
    setActiveTab('kanban');
    invalidateOptions();
    setTokenSessao(null);
    limparConfigListas();
    limparSessao();
  }, []);

  // Qualquer 401 da API (token expirado, usuário desativado) volta para o login
  useEffect(() => {
    setAoExpirarSessao((msg) => {
      handleLogout();
      setAvisoLogin(msg);
    });
    return () => setAoExpirarSessao(null);
  }, [handleLogout]);

  // Sessão guardada no navegador é conferida ao abrir: o usuário pode ter sido desativado
  useEffect(() => {
    if (!sessao) return;
    validarSessao().then(({ valida, error }) => {
      if (valida === false) {
        handleLogout();
        setAvisoLogin(error || 'Sua sessão expirou. Entre novamente.');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token]);

  // Metadados dos recursos e saúde do banco
  useEffect(() => {
    if (!sessao) return;
    let alive = true;
    fetchResources()
      .then((list) => alive && setResources(list))
      .catch((err) => console.warn('Falha ao carregar os metadados dos recursos:', err));
    fetchDbStatus().then((s) => alive && setDbStatus(s));
    return () => {
      alive = false;
    };
  }, [sessao?.token]);

  const loadDashboard = useCallback(async () => {
    if (!sessao) return;
    setIsDashboardLoading(true);
    setDashboardError(null);
    try {
      setDashboard(await fetchDashboard());
    } catch (err: any) {
      setDashboardError(err.message || 'Falha ao carregar os indicadores.');
    } finally {
      setIsDashboardLoading(false);
    }
  }, [sessao?.token]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboard();
      fetchDbStatus().then(setDbStatus);
    }
  }, [activeTab, loadDashboard, refreshToken]);

  const handleCountChange = useCallback((resourceName: string, total: number) => {
    setRecordCounts((prev) => (prev[resourceName] === total ? prev : { ...prev, [resourceName]: total }));
  }, []);

  const activeResource = useMemo(() => resources.find((r) => r.name === activeTab) || null, [resources, activeTab]);
  const resourceNegocios = useMemo(() => resources.find((r) => r.name === 'negocios'), [resources]);

  /** Telas cujo registro abre num editor próprio, no lugar do formulário genérico */
  const renderEditor = useCallback(
    (nome: string) => (record: RegistroCrud | null, fechar: () => void, aoGravar: () => void) => {
      if (nome === 'negocios') {
        // Inclusão usa o formulário genérico; um negócio existente abre a ficha completa
        return record ? (
          <NegocioFicha
            negocioId={record.id}
            resource={resourceNegocios}
            onFechar={fechar}
            onAlterado={aoGravar}
            onToast={showToast}
            onConversar={pedirConversa}
          />
        ) : null;
      }
      if (nome === 'propostas' || nome === 'pedidos') {
        return <DocumentoEditor tipo={nome} id={record?.id ?? null} onFechar={fechar} onGravado={aoGravar} onToast={showToast} />;
      }
      return null;
    },
    [resourceNegocios, showToast, pedirConversa],
  );

  // ----------------------------------------------------------
  // 1. Tela de login
  // ----------------------------------------------------------
  if (!sessao || !usuario) {
    return (
      <LoginView
        avisoInicial={avisoLogin}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLoginSuccess={(novoUsuario, empresa, token, lembrar) => {
          const nova = { usuario: novoUsuario, empresa, token };
          setTokenSessao(token);
          setSessao(nova);
          setActiveTab('kanban');
          recemEntrou.current = true;
          salvarSessao(nova, lembrar);
          setAvisoLogin(null);
          showToast(`Bem-vindo, ${novoUsuario.nome}!`);
        }}
      />
    );
  }

  // ----------------------------------------------------------
  // 2. Aplicação
  // ----------------------------------------------------------
  const TITULOS: Record<string, [string, string]> = {
    dashboard: ['Painel de Vendas', 'Indicadores do funil, follow-ups, propostas e pedidos'],
    kanban: ['Funil de Vendas', 'Arraste os negócios entre as etapas; solte em Ganho ou Perdido para encerrar'],
    configuracoes: ['Configurações', 'Preferências da empresa, por grupo'],
    conversas: ['Whatsapp', 'Mensagens do WhatsApp da empresa'],
    chamados_fila: ['Fila de Chamados', 'Chamados aguardando atendimento, em ordem de chegada'],
    chamados_ativos: ['Chamados Ativos', 'Atendimento dos chamados de suporte'],
  };
  const [headerTitle, headerSubtitle] = activeResource
    ? [activeResource.label, activeResource.description]
    : TITULOS[activeTab] || ['CRM Web', ''];

  const podeCriar = activeTab === 'kanban' || activeTab === 'chamados_ativos' || Boolean(activeResource?.canCreate);

  return (
    <div className="h-screen overflow-hidden bg-stone-100/70 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex font-sans antialiased selection:bg-blue-600 selection:text-white">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[70] bg-stone-900 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-2xl border border-stone-800 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={navegar}
        resources={resources}
        recordCounts={recordCounts}
        naoVistas={naoVistas}
        filaChamados={filaChamados}
        usuario={usuario}
        onLogout={handleLogout}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header
          empresaNome={sessao.empresa.nome}
          title={headerTitle}
          subtitle={headerSubtitle}
          dbStatus={dbStatus}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onRefresh={() => setRefreshToken((t) => t + 1)}
          onCreate={podeCriar ? () => setCreateToken((t) => t + 1) : undefined}
          createLabel={activeTab === 'kanban' ? 'Novo Negócio' : activeTab === 'chamados_ativos' ? 'Novo Chamado' : activeResource ? `Novo ${activeResource.labelSingular}` : undefined}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {activeTab === 'kanban' ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <Kanban
              resourceNegocios={resourceNegocios}
              refreshToken={refreshToken}
              createToken={createToken}
              onToast={showToast}
              onConversar={pedirConversa}
            />
          </main>
        ) : activeTab === 'conversas' ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <ConversasView refreshToken={refreshToken} onVisto={atualizarNaoVistas} pedido={pedidoConversa} onToast={showToast} />
          </main>
        ) : activeTab === 'chamados_fila' ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <ChamadosFila
              refreshToken={refreshToken}
              onMudou={atualizarFilaChamados}
              onAbrir={(id) => {
                setChamadoAbrir(id);
                navegar('chamados_ativos');
              }}
              onToast={showToast}
            />
          </main>
        ) : activeTab === 'chamados_ativos' ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <ChamadosAtivos
              refreshToken={refreshToken}
              createToken={createToken}
              abrir={chamadoAbrir}
              onMudou={atualizarFilaChamados}
              onConversar={(pessoaId) => pedirConversa({ pessoaId })}
              onToast={showToast}
              onVoltarFila={() => {
                setChamadoAbrir(null);
                navegar('chamados_fila');
              }}
            />
          </main>
        ) : activeTab === 'configuracoes' ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <ConfiguracoesView usuario={usuario} onToast={showToast} />
          </main>
        ) : activeResource ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <CrudView
              key={activeResource.name}
              resource={activeResource}
              allResources={resources}
              refreshToken={refreshToken}
              createToken={createToken}
              onToast={showToast}
              onCountChange={handleCountChange}
              onNavigate={navegar}
              renderEditor={renderEditor(activeResource.name)}
              acoesLista={
                activeResource.name === 'pessoas'
                  ? (recarregar) => (
                      <>
                        <BotaoImportarArquivo onImportado={recarregar} />
                        <BotaoImportarBM tipo="pessoas" onImportado={recarregar} />
                      </>
                    )
                  : activeResource.name === 'produtos'
                    ? (recarregar) => <BotaoImportarBM tipo="produtos" onImportado={recarregar} />
                    : undefined
              }
              acoesEmMenu={activeResource.name === 'propostas' || activeResource.name === 'pedidos'}
              acoesLinha={
                activeResource.name === 'propostas' || activeResource.name === 'pedidos'
                  ? (row, { abrir, recarregar }) => (
                      <>
                        <BotaoImprimir
                          tipo={activeResource.name as 'propostas' | 'pedidos'}
                          registro={row}
                          onToast={showToast}
                        />
                        <BotaoEnviar
                          tipo={activeResource.name as 'propostas' | 'pedidos'}
                          registro={row}
                          onRecarregar={recarregar}
                          onToast={showToast}
                        />
                        {activeResource.name === 'propostas' && <BotaoLinkAceite registro={row} onToast={showToast} />}
                        {activeResource.name === 'propostas' && (
                          <BotaoNovaVersao registro={row} onAbrir={abrir} onRecarregar={recarregar} onToast={showToast} />
                        )}
                        {activeResource.name === 'propostas' && row.status === 'aceita' && (
                          <BotaoGerarContrato registro={row} onAbrirContratos={() => navegar('contratos')} onToast={showToast} />
                        )}
                        <BotaoClonar
                          tipo={activeResource.name as 'propostas' | 'pedidos'}
                          registro={row}
                          onAbrir={abrir}
                          onRecarregar={recarregar}
                          onToast={showToast}
                        />
                      </>
                    )
                  : activeResource.name === 'contratos'
                    ? (row, { recarregar }) => <ContratoDocumentos registro={row} onRecarregar={recarregar} onToast={showToast} />
                  : ['campanhas', 'campanha_segmentos', 'campanha_mensagens'].includes(activeResource.name)
                    ? (row, { recarregar }) => (
                        <AcaoCampanha
                          tipo={activeResource.name as 'campanhas' | 'campanha_segmentos' | 'campanha_mensagens'}
                          registro={row}
                          onRecarregar={recarregar}
                          onToast={showToast}
                        />
                      )
                    : activeResource.name === 'pessoas'
                      ? (row) => <BotaoWhatsApp temNumero={Boolean(row.whatsapp || row.telefone)} onAbrir={() => pedirConversa({ pessoaId: row.id as string })} />
                      : activeResource.name === 'usuarios'
                        ? (row, { recarregar }) => <BotaoPermissoes usuario={row} resources={resources} onRecarregar={recarregar} onToast={showToast} />
                        : undefined
              }
              acoesDetalhe={(recurso, row) =>
                recurso === 'pessoas_contatos' ? (
                  <BotaoWhatsApp temNumero={Boolean(row.whatsapp || row.celular || row.telefone)} onAbrir={() => pedirConversa({ contatoId: row.id as string })} />
                ) : null
              }
            />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto min-h-0 w-full">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
              {activeTab === 'dashboard' ? (
                <Dashboard data={dashboard} isLoading={isDashboardLoading} error={dashboardError} onNavigate={navegar} />
              ) : (
                <div className="py-24 text-center text-sm text-stone-500 dark:text-stone-400">Carregando a estrutura da tela…</div>
              )}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
