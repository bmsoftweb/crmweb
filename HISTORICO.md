# Histórico de versões

Mais recente primeiro. PATCH a cada envio ao GitHub; MAJOR/MINOR só quando pedido.

## 0.0.1 — 2026-09-24

Primeira versão publicada no GitHub.

- CRM multiempresa: funil de vendas, negócios, atividades, pessoas, propostas (com versões) e pedidos, produtos, segmentos, contratos com assinatura pela D4Sign e campanhas por e-mail e WhatsApp.
- WhatsApp (Z-API ou Evolution API), em Configurações › WhatsApp: botão "Conectar WhatsApp" com QR Code que atualiza a cada 45 s e fecha sozinho ao conectar; botão "Desconectar" com confirmação; situação Conectado/Desconectado na tela, liberando só o botão que faz sentido. "Testar conexão" com o número desconectado passou a ser aviso, não erro.
- D4Sign: ao abrir a configuração com as chaves gravadas, o campo "Cofre dos contratos" já mostra o nome do cofre, não o UUID.
- Segurança: usuário e senha do MySQL saíram do código e passaram a ser obrigatórios no .env (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD).
