# Histórico de versões

Mais recente primeiro. PATCH a cada envio ao GitHub; MAJOR/MINOR só quando pedido.

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
