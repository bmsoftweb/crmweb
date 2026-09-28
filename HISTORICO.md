# Histórico de versões

Mais recente primeiro. PATCH a cada envio ao GitHub; MAJOR/MINOR só quando pedido.

## 0.0.43 — 2026-09-28

- Whatsapp: encerramento por falta de interação. Cliente sem responder X minutos à última mensagem do bot ou do técnico (Configurações › Chatbot, padrão 10; 0 desliga): o bot avisa que vai encerrar e, 30 s depois sem resposta, encerra (pesquisa se um técnico atendia). Não vale para conversa aguardando atendente, parada num Esperar da Automação ou campanhas. Roda no cron do WhatsApp e no servidor local, com trava no banco.
- Whatsapp: tag "Encerrado" na lista depois de encerrar, até o cliente mandar mensagem de novo (a nota da pesquisa não conta).
- Whatsapp e Chamados Ativos: o chat fica na última mensagem enquanto o técnico está no fim (imagem, áudio ou resposta do bot que chega depois não escondem mais o fim).
- Chat do site: sem "Pular avaliação"; o cliente avalia para abrir um novo atendimento.

## 0.0.42 — 2026-09-28

- Chatbot: escolha da IA usada pela Automação: Gemini, Claude (Opus 5, Sonnet 5, Haiku 4.5) ou DeepSeek (deepseek-flash). Cada IA com a sua chave (gravada cifrada; trocar de IA não apaga a chave da outra). O nome do assistente é o primeiro campo da tela.
- Chatbot: Claude e DeepSeek pelo SDK oficial da Anthropic (`@anthropic-ai/sdk`); o DeepSeek pelo endereço compatível (api.deepseek.com/anthropic). Claude com esforço baixo e, no Opus 5, fallback automático da Anthropic quando o filtro de segurança recusa.
- Automação: os nós passaram a se chamar "IA" e "IA Ex"; a linha de falha explica também os erros do Claude e do DeepSeek (créditos/saldo acabaram, sobrecarga 529, chave inválida).
- Whatsapp: documento enviado pelo cliente (PDF, planilha...) baixa ao clicar, com o nome original.

## 0.0.41 — 2026-09-28

- Banco: `pessoas.tecnico_padrao_id` (SQL em extras/crmweb_schema.sql).
- Pessoas: campo "Técnico Padrão" (quem atende os chamados e o WhatsApp do cliente; outro técnico ainda pode assumir).
- Fila de Chamados: coluna "Técnico" com o técnico padrão do cliente. Chamados Ativos mostram o técnico padrão enquanto o chamado está sem atendente, e no cabeçalho do chamado quando outro técnico atende.
- Whatsapp: etiqueta com o técnico padrão nas conversas que ninguém atende; o filtro "minhas" traz também as conversas aguardando dos clientes de que o usuário é o técnico padrão.
- Automação: falha (Gemini sobrecarregado, limite de uso/tokens, chave inválida, API, imagem, laço etc.) vira uma linha em vermelho na conversa, só para a equipe, com o erro em português.
- Automação: quando o Gemini falha nos nós IA e IA Ex, o cliente é avisado e a conversa passa para a equipe (aguardando atendente) em vez de ficar sem resposta.

## 0.0.40 — 2026-09-27

- Banco: `chamados.status` ganhou 'pausado'; nova tabela `chamado_secoes`; `chamado_mensagens.secao_id` (SQL em extras/crmweb_schema.sql).
- Chamados: seções de atendimento. Assumir, abrir já atendendo ou receber por transferência abre uma seção (atendente e início); pausa, transferência e encerramento a fecham (fim e motivo). Toda mensagem grava a seção aberta.
- Chamados Ativos: botão "Pausar". O chamado volta para a Fila sem atendente, com a etiqueta "Pausado" (qualquer um assume), e o cliente recebe a mensagem de pausa (chat do site ou WhatsApp). Cutucar e Tela Remota saíram do cabeçalho (ficam ao lado de "Nota interna").
- Chamados Ativos: ao encerrar ou pausar, a tela vai para a Fila de Chamados.
- Chamados: quem é do departamento Suporte ouve um som próprio ("dim-dim-dom") e vê um aviso quando entra chamado novo na fila, e começa o sistema na Fila de Chamados.
- Chamados: o aviso de mensagem do cliente só conta mensagens que chegaram depois que o técnico assumiu (assumir um chamado pausado não dispara mais aviso falso).
- Chat do site: "Recebemos sua mensagem." e, na linha de baixo, "Se quiser, mande mais detalhes por aqui."
- Menu: "Conversas" passou a "Whatsapp".

## 0.0.39 — 2026-09-27

- Menu: ícone de cadeado ao lado do nome do usuário para alterar a própria senha (confere a atual, nova com pelo menos 4 caracteres, gravada em bcrypt).
- Chat do site: "Recebemos o seu pedido" passou a "Recebemos sua mensagem...".

## 0.0.38 — 2026-09-27

- Fila de Chamados: mesmo visual das listas do app (painel chapado, barra no topo, grade de ponta a ponta com cabeçalho fixo e coluna Ações).
- Chamados Ativos: "Conectar" (no cabeçalho e na mensagem com o número do AnyDesk) pede a tela remota no chat do cliente e já abre o AnyDesk do técnico conectando.

## 0.0.37 — 2026-09-27

- Chamados Ativos: os botões "Cutucar" e "Tela Remota" aparecem também ao lado do "Nota interna", junto do campo da mensagem (continuam no cabeçalho).

## 0.0.36 — 2026-09-26

- Chamados: aviso sonoro (três notas, diferente do bipe do WhatsApp) e aviso na tela quando o cliente escreve num chamado aberto que o usuário atende; a conversa aberta se atualiza. A verificação passou a cada 5 s.
- Chamados Ativos: botão "Cutucar" (chamado do site, já assumido, no máximo um a cada 10 s). No chat do cliente toca uma campainha, o chat treme e aparece "Fulano está chamando a sua atenção"; com o painel do widget fechado, o botão flutuante no site treme e ganha um ponto vermelho.

## 0.0.35 — 2026-09-26

- Chamados Ativos e chat do site: o campo da mensagem não é mais desabilitado durante o envio (fica só leitura), então o cursor não sai dele e dá para escrever a próxima sem clicar; Enter repetido durante o envio é ignorado.

## 0.0.34 — 2026-09-26

- Chamados Ativos e chat do site: depois de enviar a mensagem (Enter), o cursor volta para o campo, para escrever a próxima sem clicar.

## 0.0.33 — 2026-09-26

- Suporte pelo site: ao terminar o atendimento, o chat volta direto ao formulário de novo atendimento (sem o botão "Novo atendimento"). Cancelado vai na hora; encerrado mostra a avaliação e, ao enviar (ou "Pular avaliação"), volta ao formulário com um aviso, os dados do cliente preenchidos e o foco no Assunto.

## 0.0.32 — 2026-09-26

- Suporte pelo site: botão "Encerrar" no chat do cliente (com confirmação). Com atendente, o chamado fica encerrado e o cliente avalia; sem ninguém ter assumido, fica cancelado (saiu da fila), sem avaliação. A linha do tempo da equipe registra quem encerrou.

## 0.0.31 — 2026-09-26

Número do AnyDesk pelo chat e botão Conectar. Banco: coluna pessoas.anydesk_id.

- Suporte pelo site: o cartão "Acesso remoto" tem o campo para o cliente enviar o número do AnyDesk ("Seu endereço").
- Chamados Ativos: o número chega na linha do tempo com o botão "Conectar", que abre o AnyDesk do técnico já conectando no cliente (anydesk:<número>); o botão também fica no cabeçalho do chamado.
- O número fica gravado na Pessoa (campo "ID AnyDesk", editável no cadastro): nos próximos chamados do cliente o "Conectar" já aparece.

## 0.0.30 — 2026-09-26

- Suporte pelo site: pedido de Tela Remota que chega com o chat aberto tenta abrir o AnyDesk sozinho, uma vez (num quadro invisível, sem tirar o chat da tela). Se o navegador bloquear (sem clique recente do cliente), fica o cartão com o botão "Abrir AnyDesk".

## 0.0.29 — 2026-09-26

- Chamados Ativos: botão "Tela Remota" (chamado do site, já assumido). O chat do cliente mostra o cartão "Acesso remoto" com "Abrir AnyDesk" (protocolo anydesk://) e o link para baixar; o cliente manda no chat o número do AnyDesk para o técnico conectar. O pedido fica na linha do tempo do chamado.

## 0.0.28 — 2026-09-26

- Widget de suporte (widget.js): funciona também quando o site insere o script depois de carregar (Wix › Código personalizado) ou no <head>.

## 0.0.27 — 2026-09-26

Chamados de suporte, suporte pelo site, fotos de produtos e a Automação no lugar do Chatbot. Banco: tabelas chamados, chamado_mensagens e chamado_categorias; colunas chamados.contato_nome/contato_telefone/contato_documento e produtos.fotos. Vercel: Blob ligado ao projeto (BLOB_READ_WRITE_TOKEN).

- Suporte › Fila de Chamados: chamados aguardando, em ordem de chegada (posição, cliente, categoria, prioridade, espera, SLA vencido) e Assumir; etiqueta com a quantidade no menu.
- Suporte › Chamados Ativos: lista com filtros rápidos (Meus, Todos, Aguardando, Em andamento, Encerrados) e busca; chamado aberto com a linha do tempo, resposta ao cliente (vai pelo WhatsApp da pessoa) ou nota interna, Assumir, Transferir (usuário ou departamento, que devolve à fila) e Encerrar. Novo Chamado com busca do cliente, categoria (SLA em horas), prioridade, canal e "Atender agora". Cadastros › Categorias de Chamado. As duas telas entram nas Permissões.
- Suporte pelo site: widget.js (botão flutuante + painel) abre /suporte, onde o cliente abre o chamado (CNPJ/CPF, nome, WhatsApp, assunto e descrição), vê a posição na fila, conversa com a equipe e avalia de 1 a 5 no fim. O acesso ao chamado é pelo token assinado guardado no navegador que abriu.
- Produtos: até 4 fotos (do computador ou da internet), reduzidas a 400 px no lado maior e gravadas no Vercel Blob no padrão do b2b (produtos/<empresa>/<id 9 dígitos>-<posição>.jpg, ?v=<md5>); saem do storage ao remover e ao excluir o produto.
- Listas: o nome do registro ligado (produto do item de pedido, pessoa do negócio...) vem do servidor; não aparece mais "…" em cadastros com mais de 5.000 registros.
- Configurações: a aba Jornada virou Automação e é quem atende o WhatsApp; o Chatbot ficou só com chave, modelo, nome, tempo para devolver ao bot, revezamento e pesquisa. O nó IA (Gemini) ganhou texto-base próprio (sem ele, usa o texto-base antigo). Saíram o bot sem automação e o menu de departamentos do Chatbot.

## 0.0.26 — 2026-09-26

Importação do bmsoft pelo token da bmAPI e importação de produtos. Banco: coluna produtos.cod_integracao (única por empresa).

- Importar BM: pede o token da bmAPI (X-API-Key) no lugar do número do servidor. O CRM acha o servidor dono do token em bmapi.servidores (endereço, porta e identificação, mostrada ao lado do campo enquanto se digita) e grava o token cifrado na configuração da empresa: nas próximas vezes não precisa digitar ("Trocar token" para mudar). O token não volta ao navegador; a busca pelo número do servidor saiu.
- Produtos › Importar BM: importa PRODUTOSPRINCIPAL (ID → cód. integração BM-<id> e SKU, Descricao → nome, Texto → descrição, PrecoVenda1 → preço de tabela, UNVenda → unidade, Ativo → ativo). Entram os ativos; os já importados são atualizados, inclusive desativados quando ficam inativos no bmsoft.

## 0.0.25 — 2026-09-25

Menu lateral recolhível e ajustes na tela de aprovação da proposta.

- Menu lateral: alça fina com chevron, centralizada na borda, recolhe o menu para uma faixa só com os ícones (nome no tooltip; conversas não vistas como ponto vermelho) e abre de novo. A escolha fica guardada no navegador. No celular continua a gaveta.
- Aprovação da proposta pelo link: no lugar dos botões Aprovar/Recusar, o título "Para aprovar preencha abaixo:" com o formulário de aprovação; embaixo de "Aprovar e assinar", o botão "Recusar a Proposta", que abre o motivo da recusa com Voltar e Confirmar recusa.

## 0.0.24 — 2026-09-25

Jornada: nó "IA (Gemini) Ex"; ações das listas em menu "...".

- Nó "IA (Gemini) Ex" (Integrações): texto-base próprio (o que a IA deve fazer) e de 1 a 9 saídas ("quando o cliente quiser..."), cada uma um ponto de ligação, mais "não identificou". A IA pergunta, entende a resposta (número ou palavras) e segue pela saída certa; se a primeira mensagem já disser o que o cliente quer, vai direto (número solto na abertura não conta). Sem entender depois das tentativas configuradas (padrão 3), ou sem o Gemini, sai por "não identificou". A escolha fica em {{ia_opcao}}. Usa a chave e o modelo de Configurações › Chatbot.
- Propostas e Pedidos de Venda: a coluna Ações virou um botão "..." com menu popup (ícone e nome de cada ação; Editar e Excluir no fim). Regra: coluna com mais de 3 ícones usa o menu.

## 0.0.23 — 2026-09-25

Aprovação da proposta pelo cliente com assinatura digital. Banco: colunas propostas.aceite_* (token, em, nome, documento, ip, navegador, assinatura, hash).

- Envio da proposta (WhatsApp ou e-mail): além do PDF, a mensagem leva o link único /p/<código> para o cliente aprovar e assinar. Ícone "Copiar link" na lista de propostas para mandar por outro meio.
- Tela do cliente (sem login, pensada para celular): empresa, número/versão, itens, total, validade, condições e PDF. Aprovar: nome, CPF/CNPJ, assinatura desenhada no quadro e "Li e aprovo". Recusar: nome e motivo. Link de proposta já respondida, vencida, substituída por versão nova ou fechada mostra o aviso correspondente.
- Aprovação: proposta aceita, demais versões fechadas e pedido gerado (mesma rotina do botão Aprovar); grava data/hora, IP, navegador, a imagem da assinatura e o hash SHA-256 do conteúdo aprovado. Recusa: proposta recusada, motivo no histórico. Nos dois casos o dono do negócio é avisado pelo WhatsApp.
- Na proposta aberta no CRM, quadro com a resposta do cliente (assinatura, documento, data, IP e hash).

## 0.0.22 — 2026-09-25

Pesquisa de satisfação do WhatsApp. Banco: tabela avaliacoes.

- Sai quando a equipe clica em Encerrar numa conversa que atendeu e quando o cliente chega ao fim da jornada: nota de 1 a 5 (número ou estrelas); nota de 1 a 3 pede um comentário; agradecimento no fim. Resposta que não é nota descarta a pesquisa e segue o atendimento normal; sem resposta, vence nos minutos configurados. As respostas não acionam o bot nem entram no histórico da IA.
- Configurações › Chatbot › Pesquisa de satisfação: liga/desliga (começa desligada), textos da pergunta ({{atendente}}), do pedido de comentário e do agradecimento, validade em minutos e prévia.
- Resultados: linha na conversa ("Cliente avaliou ⭐⭐⭐⭐ (4)" e o comentário), tela Vendas › Avaliações (só leitura, com filtros) e card "Satisfação no mês" no Painel de Vendas (média geral e por atendente).

## 0.0.21 — 2026-09-25

Usuários: permissões, perfis e revezamento de leads. Banco: colunas usuarios.permissoes (JSON) e usuarios.revezamento; usuarios.tipo com os perfis admin, gerente, supervisor, client (Vendedor) e funcionario.

- Usuários › Permissões (ícone na coluna Ações): modal com as opções do menu, agrupadas como na barra lateral, para liberar ou não cada uma (com "Marcar todos" por grupo e destaque da linha). Sem permissão, a opção some do menu e o servidor recusa a lista daquele cadastro, o Painel, as Conversas e as Configurações; combos dos formulários e painéis de detalhe continuam funcionando. Usuário sem nada gravado acessa tudo; administrador acessa tudo.
- Configurações e Usuários: só administradores (os campos personalizados de Pessoas continuam lidos por todos).
- Perfis: Administrador, Gerente, Supervisor, Vendedor e Funcionário.
- Revezamento de leads: campo "Entra no revezamento de leads" no cadastro do usuário (qualquer perfil). Chatbot e jornada distribuem os leads entre os usuários ativos com o campo ligado; ninguém no revezamento, o lead fica sem responsável. Configurações › Chatbot mostra quem está no revezamento (a lista de vendedores que ficava lá saiu).
- Jornada: ao chegar ao Fim (ou a uma saída sem ligação), a conversa ganha a linha "Atendimento encerrado pelo cliente (fim da jornada)".

## 0.0.20 — 2026-09-25

- Conversas: ao enviar, o botão mostra "Enviando..." e o campo de mensagem fica desabilitado até terminar; depois o cursor volta ao campo.

## 0.0.19 — 2026-09-25

- Conversas: Encerrar só aparece com atendimento em andamento (e o servidor recusa encerrar de novo); Transferir só para quem está atendendo (ou o administrador); botões desabilitados enquanto a ação é gravada.

## 0.0.18 — 2026-09-25

Conversas: atender, travar e transferir. Banco: coluna whatsapp_conversas.atendido_em.

- Estados da conversa: com o bot/jornada, Aguardando (ninguém pegou) ou Em atendimento (quem e desde quando), no cabeçalho e no card da lista.
- Botão Atender: pega a conversa e trava para o atendente (os outros veem, mas não respondem nem mudam o atendimento; o servidor também recusa). Administrador pode Assumir de outro. Responder sem ninguém atendendo pega a conversa.
- Transferir: para um atendente (já fica com ele) ou para um departamento (volta a aguardar, com aviso sonoro para quem é de lá).
- Atendente que pegou e não respondeu no tempo de devolver ao bot: a conversa volta a aguardar. Com o chatbot desligado, conversa sem atendente fica aguardando.
- Linhas na conversa (só no CRM): começou o atendimento, assumiu, transferiu, devolveu ao bot, liberado pelo tempo.
- "Só as minhas": as que eu atendo e as que aguardam no meu departamento (ou sem departamento).

## 0.0.17 — 2026-09-25

- Conversas: linha "Atendimento encerrado pelo tempo, sem resposta de atendente" quando a conversa volta ao bot pelo tempo, com a hora em que o tempo acabou; a IA também recomeça depois dela.
- Conversas: a barra de gravação de áudio tem a mesma altura do campo de texto (os botões não achatam mais).

## 0.0.16 — 2026-09-25

- Conversas: Encerrar deixa uma linha na conversa ("Atendimento encerrado por Luis · 14:01"), que não vai para o cliente; a IA passa a considerar só as mensagens depois do último encerramento.
- Ícone do app: funil de vendas no azul do logo (public/favicon.svg), no lugar do ícone padrão.

## 0.0.15 — 2026-09-25

- Jornada: depois do Fim (ou de uma saída sem ligação), a próxima mensagem do cliente recomeça a jornada do Início (antes só recomeçava depois dos minutos de devolver ao bot).

## 0.0.14 — 2026-09-25

- Conversas: resposta do bot ainda sendo escrita aparece como "digitando..." (não mais um balão vazio com relógio); as respostas do bot aparecem com o nome do assistente ("Eloisa (bot)").
- Chatbot: a IA só pode dizer que vai transferir se usar a transferência para humano na mesma resposta.

## 0.0.13 — 2026-09-25

- Jornada: os tipos de nó ficam numa barra lateral à esquerda do quadro, agrupados (Conversa, Lógica, Integrações, CRM, Encerrar). Clique inclui no centro do quadro; arrastar até o quadro inclui onde for solto.

## 0.0.12 — 2026-09-25

- Conversas: botão Encerrar — fim da sessão, como se o tempo de devolver ao bot tivesse passado (sai do departamento e da jornada; a próxima mensagem do cliente recomeça). "Devolver ao bot" agora continua a mesma sessão (mantém o departamento). Os botões aparecem também nas conversas atendidas pela jornada.
- Aviso sonoro e na tela, em qualquer tela do app (consulta a cada 15 s, também com a aba em segundo plano), quando um cliente é encaminhado ao departamento do usuário e ninguém assumiu.
- Mensagens enviadas pela tela Conversas chegam ao cliente com o nome do atendente em negrito ("*Luis:* ..."), também na legenda de imagem, vídeo e documento; no CRM ficam gravadas sem o nome.

## 0.0.11 — 2026-09-25

WhatsApp: jornada de atendimento, menu de departamentos, envio de mídia e quem executa as atividades. Banco: tabelas departamentos e jornada_arquivos; colunas usuarios.departamento_id, atividades.executor_id e departamento_id, whatsapp_conversas.departamento_id, no_atual, variaveis e retomar_em. Dependência nova: @xyflow/react.

- Configurações › Jornada: editor gráfico do atendimento do WhatsApp (arrastar nós e ligar saídas). Nós: Início, Mensagem, Enviar imagem, Menu, Pergunta, Condição (horário, cadastrado, negócio aberto, variável), Condição múltipla, Esperar (retomado pelo cron), Chamar API (https, variáveis, cabeçalhos secretos cifrados, campos da resposta viram variáveis), IA (Gemini), Registrar lead, Departamento e Fim. Modo teste (só os números da lista) ou todos os clientes; modelo a partir do menu do Chatbot.
- Chatbot: menu de departamentos (número ou texto, com a IA como apoio); por departamento, o bot continua ou passa direto para humano, com atividade para o departamento e aviso no WhatsApp de quem é dele. Tempo para devolver ao bot agora em minutos (a configuração antiga, em horas, é convertida). O bot não responde números de usuários da empresa.
- Conversas: enviar imagem, vídeo, áudio e documento (até 3 MB) e gravar áudio pelo microfone; etiqueta do departamento e filtro "Só as minhas".
- Cadastros › Departamentos; usuário com departamento. Atividade com "Quem executa" (usuário, departamento ou qualquer pessoa), coluna na lista e na ficha do negócio, filtro "Só as minhas". Lembrete "para o vendedor" vai para quem executa (sem executor, para o responsável do negócio).
- Configurações › WhatsApp: situação da conexão num quadro com o número conectado.
- Formulários de inclusão abrem com o foco no primeiro campo vazio.

## 0.0.10 — 2026-09-25

- Conversas: imagens, figurinhas, áudios e vídeos aparecem na conversa. O arquivo é buscado na Evolution na hora (o CRM não guarda a mídia); imagem abre em tamanho real ao clicar, áudio com player, vídeo carrega ao clicar em "Carregar vídeo". Mídia que o WhatsApp não tem mais aparece como "não disponível".

## 0.0.9 — 2026-09-25

Chatbot com IA (Gemini) no WhatsApp. Banco: tabela whatsapp_conversas.

- Configurações › Chatbot: liga/desliga, chave do Gemini (gravada cifrada), modelo (Gemini 3.8 Flash, 3.5 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite), nome do assistente, texto-base da empresa, horas para devolver ao bot e vendedores do revezamento. Botão "Testar Gemini".
- O bot responde o tempo todo, com espera aleatória de 1 a 30 segundos e "digitando..." (evita banimento), só a última mensagem recebida e nunca duas vezes a mesma.
- Quem ainda não é cliente vira lead: pessoa com o WhatsApp, contato (se informou a empresa), negócio na primeira etapa do funil para o próximo vendedor do revezamento e atividade WhatsApp para ele.
- Passa a conversa para um humano quando o cliente pede ou quando não sabe responder. Conversas: etiqueta "Bot atendendo"/"Humano atendendo" com os botões Assumir e Devolver ao bot; responder pela tela assume a conversa; volta ao bot depois das horas configuradas sem resposta de atendente. Respostas do bot aparecem marcadas "Bot".
- Ficha do negócio: ícone do WhatsApp ao lado da pessoa, abre a conversa.
- Configurações › WhatsApp: a situação da conexão virou um quadro abaixo dos botões, com o número conectado e a instância.

## 0.0.8 — 2026-09-25

- Ícone do WhatsApp na lista de Pessoas e na aba Contatos do painel de detalhes: abre a conversa com o WhatsApp da pessoa (sem ele, o telefone) ou do contato (WhatsApp, celular, telefone). Sem número, o ícone fica apagado; sem DDD, avisa para corrigir o cadastro.
- Configurações › WhatsApp: uma instância só pode ser usada por uma empresa (o mesmo servidor + nome na Evolution, ou o mesmo ID na Z-API). Outra empresa com a mesma instância recebe "nome da instância inválido".

## 0.0.7 — 2026-09-25

WhatsApp, etapa 3 (mensagens automáticas), contatos das pessoas e nova conversa. Banco: colunas whatsapp_mensagens.origem, erro, nome_contato e contato_id; atividades.lembrete_para; usuarios.telefone; pessoas.whatsapp; tabela pessoas_contatos.

- Mensagens automáticas (Configurações › Mensagens automáticas): lembrete de atividade (X horas antes), proposta perto de vencer, pedido aprovado/faturado, contrato perto de vencer e assinatura pendente. Texto editável com variáveis, liga/desliga e antecedência por evento. Saem das 8h às 20h, junto com as campanhas (cron da Vercel), com a origem reservada antes do envio: o mesmo aviso nunca sai duas vezes.
- Lembrete de atividade: campo "Lembrete para" na atividade (cliente, vendedor, os dois, ninguém) e mensagem própria para o vendedor (responsável do negócio). Usuários ganham o campo WhatsApp.
- Ficha do negócio: atividade do tipo WhatsApp pendente abre a conversa com o cliente; enviar a mensagem por ali conclui a atividade.
- Contatos das pessoas (quem se fala na empresa-cliente): aba Contatos no painel de detalhes da lista de Pessoas, com incluir, editar e excluir; um principal por pessoa. Pessoa ganha o campo WhatsApp, usado primeiro nas campanhas, mensagens automáticas e no envio de proposta/pedido.
- Conversas: o número é ligado à pessoa ou ao contato (WhatsApp, celular, telefone); mostra o contato e a empresa, o nome do perfil do WhatsApp de quem não está cadastrado ("não cadastrado") e o número ao lado do nome. Cadastro rápido do número como nova pessoa ou como contato de uma pessoa. Botão "Nova" para abrir conversa com uma pessoa, um contato ou um número digitado. Mensagens automáticas aparecem marcadas; as que falharam mostram o motivo.
- Tipo de atividade WhatsApp; critério de segmento "Tem WhatsApp cadastrado"; variável {{whatsapp}} nas campanhas.

## 0.0.6 — 2026-09-24

WhatsApp, etapa 2: tela de conversas.

- Novo menu Conversas (Visão Geral), com a etiqueta de mensagens recebidas não vistas (atualiza a cada 30 s).
- Lista de conversas por número: nome da pessoa ou telefone formatado, prévia e horário da última mensagem, contador de não vistas e busca por nome ou telefone (atualiza a cada 10 s).
- Conversa: balões separados por dia, situação das enviadas (enviada, entregue, lida, falhou), quem enviou (usuário ou campanha), rótulo de imagem/áudio/documento; abrir marca como vistas; conversa sem pessoa é ligada ao cadastro quando o número passa a existir (atualiza a cada 5 s).
- Responder pela tela (Enter envia, Shift+Enter quebra a linha): sai pelo WhatsApp da empresa, registrada com o usuário.
- No celular, uma coluna por vez.
- Mensagens de empresas (botões, lista, modelo, interativa, enquete) e as respostas a elas passam a aparecer como texto; formato desconhecido fica registrado no log.

## 0.0.5 — 2026-09-24

WhatsApp, etapa 1: receber mensagens e status de entrega (Evolution API). Tabela nova whatsapp_mensagens.

- Recebimento: a Evolution avisa o CRM em /api/webhooks/evolution/<token> (o token identifica a empresa). Mensagens recebidas e as enviadas pelo celular são gravadas e ligadas à pessoa pelo telefone (com ou sem o 9, com ou sem DDI, endereçamento LID; cadastro sem DDD liga pelos 8 últimos dígitos). Grupos, reações e outras instâncias são ignorados.
- Mensagens enviadas pelo CRM (campanhas, proposta/pedido em PDF) ficam registradas com o id do WhatsApp, a pessoa e o usuário.
- Status de entrega: entregue/lida atualizam a mensagem e o disparo da campanha (entregue_em, lido_em), sem voltar atrás.
- Configurações › WhatsApp: quadro "Recebimento de mensagens" com o botão "Ativar recebimento", que cadastra o endereço na Evolution (recusa endereço local: ativar pela Vercel).
- Atividades: novo tipo WhatsApp.

## 0.0.4 — 2026-09-24

- WhatsApp: o botão "Desconectar" só fica liberado quando o número está comprovadamente conectado. Com a situação desconhecida (instância inexistente, chave recusada), ele ficava liberado e devolvia erro do provedor; nesses casos o "Testar conexão" mostra a causa.

## 0.0.3 — 2026-09-24

- WhatsApp (Evolution API): o QR Code fechava sozinho e avisava "conectado" sem o número ter sido lido. A Evolution 2.3.7 continua dizendo "open" em instance/connectionState e instance/connect depois que o aparelho é removido. A situação da conexão agora vem de instance/fetchInstances (Testar conexão, indicador Conectado/Desconectado e espera do QR), e quando o connect diz "open" sem estar conectado o app faz logout na instância e pede o QR de novo.

## 0.0.2 — 2026-09-24

Deploy na Vercel.

- Corrigido "Falha no login (HTTP 404)" na Vercel: só o frontend era publicado. O app Express passou para server/app.ts e é servido pela função api/index.ts; o vercel.json manda todo /api/* para ela. O server.ts ficou só para rodar local (Vite, porta e rotinas). Imports do servidor com extensão .js (a Vercel roda ESM sem empacotar).
- PDF de proposta, pedido e contrato na Vercel: Chromium para serverless (@sparticuz/chromium + puppeteer-core). Fora da Vercel continua o Edge/Chrome instalado.
- Rotinas pelo cron da Vercel (plano Pro): envio das campanhas de WhatsApp a cada minuto (/api/cron/whatsapp, até 45 s por execução, o resto fica para o minuto seguinte) e rotina de contratos a cada hora (/api/cron/contratos). Rotas protegidas pelo CRON_SECRET.
- Webhook da D4Sign processa o aviso antes de responder (na Vercel a função pode ser congelada depois da resposta).
- O build do servidor (server.cjs e sourcemap) saiu de dist/, que a Vercel publica, para build/.

## 0.0.1 — 2026-09-24

Primeira versão publicada no GitHub.

- CRM multiempresa: funil de vendas, negócios, atividades, pessoas, propostas (com versões) e pedidos, produtos, segmentos, contratos com assinatura pela D4Sign e campanhas por e-mail e WhatsApp.
- WhatsApp (Z-API ou Evolution API), em Configurações › WhatsApp: botão "Conectar WhatsApp" com QR Code que atualiza a cada 45 s e fecha sozinho ao conectar; botão "Desconectar" com confirmação; situação Conectado/Desconectado na tela, liberando só o botão que faz sentido. "Testar conexão" com o número desconectado passou a ser aviso, não erro.
- D4Sign: ao abrir a configuração com as chaves gravadas, o campo "Cofre dos contratos" já mostra o nome do cofre, não o UUID.
- Segurança: usuário e senha do MySQL saíram do código e passaram a ser obrigatórios no .env (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD).
