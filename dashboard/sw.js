// Service Worker para agent-brain dashboard
// Estrategia:
//   - Navegación (HTML): stale-while-revalidate (offline-first)
//   - Assets estáticos (CSS/JS/JSON): cache-first con revalidación
//   - Imágenes/iconos: cache-first permanente
//   - memory/*.json: network-first (datos vivos, fallback a cache)

const VERSION = 'v1.0.7';
const CACHE_STATIC = `agent-brain-static-${VERSION}`;
const CACHE_DATA = `agent-brain-data-${VERSION}`;
const CACHE_IMG = `agent-brain-img-${VERSION}`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

// Install: pre-cachea assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[sw] algunos assets no se pudieron cachear:', err.message);
      })
    )
  );
  self.skipWaiting();
});

// Activate: limpia caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_STATIC, CACHE_DATA, CACHE_IMG].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Helper: stale-while-revalidate
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

// Helper: network-first con fallback a cache
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Helper: cache-first (para imágenes)
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

  // Navegación (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
    return;
  }

  // Datos vivos (memory/*.json, tasks/*.json)
  if (url.pathname.includes('/memory/') || url.pathname.includes('/tasks/')) {
    event.respondWith(networkFirst(request, CACHE_DATA));
    return;
  }

  // Imágenes
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, CACHE_IMG));
    return;
  }

  // CSS, JS, manifest
  if (['style', 'script', 'manifest'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
    return;
  }

  // Default: try network, fallback to cache, then a safe error response.
  // BUGFIX (audit #1.7): caches.match() resolves to undefined when nothing matches,
  // which makes respondWith(undefined) throw "The FetchEvent handler did not respond".
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
