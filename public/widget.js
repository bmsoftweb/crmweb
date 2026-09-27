/*
 * Suporte pelo site (CRM Web). No site do cliente, antes de </body>:
 *   <script src="https://<endereço do CRM>/widget.js" data-empresa="1"></script>
 * Opcional: data-cnpj="12345678000199" (já vem preenchido), data-cor="#2563eb".
 * Mostra um botão flutuante que abre o chat de suporte (página /suporte do CRM) num painel.
 */
(function () {
  if (window.__crmwebSuporte) return;
  window.__crmwebSuporte = true;

  // No Wix (Código personalizado) o script pode ser inserido depois: aí currentScript vem vazio
  var script = document.currentScript || document.querySelector('script[src*="/widget.js"]');
  if (!script) return;
  var origem = new URL(script.src).origin;
  var empresa = script.getAttribute('data-empresa') || '1';
  var cnpj = script.getAttribute('data-cnpj') || '';
  var cor = script.getAttribute('data-cor') || '#2563eb';
  var url = origem + '/suporte?e=' + encodeURIComponent(empresa) + (cnpj ? '&cnpj=' + encodeURIComponent(cnpj) : '');

  var caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:system-ui,sans-serif;';

  var painel = document.createElement('div');
  painel.style.cssText =
    'display:none;width:380px;height:600px;max-width:calc(100vw - 40px);max-height:calc(100vh - 110px);margin-bottom:14px;' +
    'border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25);background:#fff;';
  var quadro = null; // o chat só carrega na primeira abertura

  var botao = document.createElement('button');
  botao.type = 'button';
  botao.setAttribute('aria-label', 'Suporte');
  botao.style.cssText =
    'display:flex;align-items:center;justify-content:center;margin-left:auto;width:60px;height:60px;border:0;border-radius:50%;' +
    'cursor:pointer;color:#fff;background:' + cor + ';box-shadow:0 8px 24px rgba(0,0,0,.25);';
  var iconeChat =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var iconeFechar =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  botao.innerHTML = iconeChat;

  botao.onclick = function () {
    var abrir = painel.style.display === 'none';
    if (abrir && !quadro) {
      quadro = document.createElement('iframe');
      quadro.src = url;
      quadro.title = 'Suporte';
      quadro.style.cssText = 'width:100%;height:100%;border:0;';
      painel.appendChild(quadro);
    }
    painel.style.display = abrir ? 'block' : 'none';
    botao.innerHTML = abrir ? iconeFechar : iconeChat;
  };

  caixa.appendChild(painel);
  caixa.appendChild(botao);
  // Script colocado no <head>: espera a página ter corpo
  if (document.body) document.body.appendChild(caixa);
  else document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(caixa);
  });
})();
