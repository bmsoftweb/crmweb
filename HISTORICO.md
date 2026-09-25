# Histórico de versões

Mais recente primeiro. PATCH a cada envio ao GitHub; MAJOR/MINOR só quando pedido.

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
