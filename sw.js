const CACHE_NAME = 'sites-manager-v16';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './jszip.min.js'
];

// Instalar o Service Worker
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Cache aberto v13');
        return cache.addAll(urlsToCache);
      })
      .catch(function(error) {
        console.log('Erro ao adicionar ao cache:', error);
      })
  );
  self.skipWaiting(); // Força a atualização imediata
});

// Interceptar requisições (AGORA SALVA LINKS EXTERNOS TAMBÉM)
self.addEventListener('fetch', function(event) {
  // Ignora requisições que não sejam GET (ex: extensões de navegador)
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Se já temos a fonte ou arquivo no cache (do mato), usa ele!
        if (response) {
          return response;
        }
        
        // Se tem internet, busca na rede
        return fetch(event.request)
          .then(function(networkResponse) {
            // Aceita respostas normais (200) e respostas "Opaque" (0) que são típicas de fontes externas/CDNs
            if (!networkResponse || (networkResponse.status !== 200 && networkResponse.type !== 'opaque')) {
              return networkResponse;
            }

            // Clona a fonte/arquivo e salva no cache para uso offline futuro
            var responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(function() {
            // Se falhar e for a página principal, carrega o index
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// Ativar o Service Worker e limpar o lixo velho
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
