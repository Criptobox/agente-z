// Service Worker para agent-brain dashboard
// v1.0.8 — NETWORK-FIRST agresivo para evitar el bug de "veo la versión vieja"
// Estrategia:
//   - HTML, CSS, JS, manifest: NETWORK-FIRST (siempre sirve la versión nueva)
//   - Imágenes/iconos: cache-first (no cambian)
//   - memory/*.json: network-first (datos vivos)
// Al detectar nuevo SW, forza skipWaiting + clients.claim + reload automático.

const VERSION = 'v1.0.8';
const CACHE_STATIC = `agent-brain-static-${VERSION}`;
const CACHE_DATA = `agent-brain-data-${VERSION}`;
const CACHE_IMG = `agent-brain-img-${VERSION}`;

// Las URLs llevan ?v=5 para coincidir EXACTAMENTE con lo que pide index.html:
// cache.match() compara la URL completa, así que cachear './app.js' no servía
// de fallback offline para la petición './app.js?v=5'.
const ASSET_QUERY = '?v=5';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css' + ASSET_QUERY,
  './app.js' + ASSET_QUERY,
  './streaming.js' + ASSET_QUERY,
  './settings.js' + ASSET_QUERY,
  './sales-forecast.js' + ASSET_QUERY,
  './background-runner.js' + ASSET_QUERY,
  './auth.js' + ASSET_QUERY,
  './graph.js' + ASSET_QUERY,
  './voice.js' + ASSET_QUERY,
  './tiendamax.js' + ASSET_QUERY,
  './supabase-client.js' + ASSET_QUERY,
  './manifest.json',
  './setup.html',
  './favicon-180.png',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
];

// Install: pre-cachea assets estáticos
self.addEventListener('install', (event) => {
  console.log('[sw v1.0.8] install');
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[sw] algunos assets no se pudieron cachear:', err.message);
      })
    )
  );
  // Forzar activación inmediata — NO esperar a que se cierren todas las pestañas
  self.skipWaiting();
});

// Activate: limpia TODOS los caches viejos y toma control inmediato
self.addEventListener('activate', (event) => {
  console.log('[sw v1.0.8] activate — purgando caches viejos');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_DATA, CACHE_IMG].includes(k))
          .map((k) => {
            console.log('[sw] eliminando cache viejo:', k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      // Tomar control de TODOS los clients inmediatamente
      return self.clients.claim();
    }).then(() => {
      // Avisar a los clients que hay nueva versión
      return self.clients.matchAll({ includeUncontrolled: true });
    }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: VERSION });
      });
    })
  );
});

// Helper: NETWORK-FIRST con fallback a cache
// SIEMPRE intenta red primero. Solo usa cache si la red falla.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    // cache: 'no-cache' fuerza validación con el servidor
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && (response.status === 200 || response.type === 'opaque')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      console.log('[sw] offline — sirviendo cache:', request.url);
      return cached;
    }
    throw err;
  }
}

// Helper: cache-first (solo para imágenes — no cambian)
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return cached;
  }
}

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo same-origin
  if (url.origin !== self.location.origin) return;

  // Solo GET
  if (request.method !== 'GET') return;

  // Navegación (HTML) — NETWORK-FIRST para siempre servir versión nueva
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CACHE_STATIC));
    return;
  }

  // Datos vivos (memory/*.json, tasks/*.json)
  if (url.pathname.includes('/memory/') || url.pathname.includes('/tasks/')) {
    event.respondWith(networkFirst(request, CACHE_DATA));
    return;
  }

  // Imágenes — cache-first
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, CACHE_IMG));
    return;
  }

  // CSS, JS, manifest — NETWORK-FIRST (FIX CLAVE: antes era stale-while-revalidate)
  // Esto garantiza que cualquier cambio en app.js/styles.js se sirva INMEDIATAMENTE
  if (['style', 'script', 'manifest'].includes(request.destination)) {
    event.respondWith(networkFirst(request, CACHE_STATIC));
    return;
  }

  // Default
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then(r => r || new Response('Offline', { status: 503, statusText: 'Offline' }))
    )
  );
});

// Mensajería: permitir forzar update desde la UI
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    Promise.all([caches.delete(CACHE_STATIC), caches.delete(CACHE_DATA), caches.delete(CACHE_IMG)])
      .then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' }));
  }
});
