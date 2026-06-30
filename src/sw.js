/* HappyTiles service worker — cache-first, offline-capable.
 * Bump CACHE_VERSION on every release so clients pick up new assets. */

const CACHE_VERSION = 'happytiles-v14';

// Everything the app needs to run fully offline. All assets are local —
// the app makes no third-party / network requests at runtime.
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './games-core.js',
  './math-core.js',
  './chess-core.js',
  './app.js',
  './manifest.json',
  './icons/icon.svg'
];

// Install: pre-cache the app shell.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: drop any caches from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first. Same-origin GET only; never touch other origins.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Cache successful basic responses for next time.
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline navigation fallback → app shell.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    })
  );
});
