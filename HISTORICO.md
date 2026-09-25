# Histórico de versões

Mais recente primeiro. PATCH a cada envio ao GitHub; MAJOR/MINOR só quando pedido.

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
