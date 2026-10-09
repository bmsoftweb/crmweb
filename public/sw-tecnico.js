// Service worker do app do técnico (/tecnico): o app abre sem sinal. Os dados ficam no IndexedDB (src/tecnico/dados.ts);
// aqui só os arquivos do app. /api nunca passa pelo cache.
const CACHE = 'tecnico-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/tecnico')));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Página: da rede (pega a versão nova do app); sem sinal, a guardada
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copia = r.clone();
          if (r.ok) caches.open(CACHE).then((c) => c.put('/tecnico', copia));
          return r;
        })
        .catch(() => caches.match('/tecnico')),
    );
    return;
  }

  // Arquivos do build (o nome muda a cada versão): do cache; senão, da rede e guarda
  // ponytail: os de versões antigas ficam no cache; limpar pelo nome se o espaço pesar
  e.respondWith(
    caches.match(e.request).then(
      (achado) =>
        achado ||
        fetch(e.request).then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return r;
        }),
    ),
  );
});
