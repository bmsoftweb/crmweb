import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Usuario, ResourceDef, DbConnectionStatus, DashboardData, RegistroCrud } from './types';
import {
  setTokenSessao,
  setAoExpirarSessao,
  fetchResources,
  fetchDbStatus,
  fetchDashboard,
  invalidateOptions,
  validarSessao,
  fetchNaoVistas,
} from './services/api';
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
import { BotaoNovaVersao } from './components/BotaoNovaVersao';
import { ContratoDocumentos } from './components/ContratoDocumentos';
import { BotaoGerarContrato } from './components/BotaoGerarContrato';
import { ConfiguracoesView } from './components/ConfiguracoesView';
import { ConversasView } from './components/ConversasView';
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
  /** Mensagens do WhatsApp recebidas e ainda não vistas (etiqueta do menu Conversas) */
  const [naoVistas, setNaoVistas] = useState(0);
  const atualizarNaoVistas = useCallback(() => {
    fetchNaoVistas()
      .then((r) => setNaoVistas(r.total))
      .catch(() => {}); // sem a tabela ou sem conexão: fica sem etiqueta
  }, []);
  useEffect(() => {
    if (!sessao) return;
    atualizarNaoVistas();
    const i = setInterval(() => !document.hidden && atualizarNaoVistas(), 30_000);
    return () => clearInterval(i);
  }, [sessao, atualizarNaoVistas]);

  /** Motivo exibido na tela de login quando a sessão é recusada */
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);

  /** Troca de tela; o gatilho do botão "Novo" zera para a tela nova não abrir uma inclusão sozinha */
  const navegar = useCallback((tab: string) => {
    setCreateToken(0);
    setActiveTab(tab);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

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
          <NegocioFicha negocioId={record.id} resource={resourceNegocios} onFechar={fechar} onAlterado={aoGravar} onToast={showToast} />
        ) : null;
      }
      if (nome === 'propostas' || nome === 'pedidos') {
        return <DocumentoEditor tipo={nome} id={record?.id ?? null} onFechar={fechar} onGravado={aoGravar} onToast={showToast} />;
      }
      return null;
    },
    [resourceNegocios, showToast],
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
    conversas: ['Conversas', 'Mensagens do WhatsApp da empresa'],
  };
  const [headerTitle, headerSubtitle] = activeResource
    ? [activeResource.label, activeResource.description]
    : TITULOS[activeTab] || ['CRM Web', ''];

  const podeCriar = activeTab === 'kanban' || Boolean(activeResource?.canCreate);

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
          createLabel={activeTab === 'kanban' ? 'Novo Negócio' : activeResource ? `Novo ${activeResource.labelSingular}` : undefined}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {activeTab === 'kanban' ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <Kanban resourceNegocios={resourceNegocios} refreshToken={refreshToken} createToken={createToken} onToast={showToast} />
          </main>
        ) : activeTab === 'conversas' ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <ConversasView refreshToken={refreshToken} onVisto={atualizarNaoVistas} />
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
                        <BotaoImportarBM onImportado={recarregar} />
                      </>
                    )
                  : undefined
              }
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
                    : undefined
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
