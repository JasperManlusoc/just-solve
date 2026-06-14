/* =====================================================================
   SolveForJas — Service Worker
   Provides offline support via Cache First strategy for app shell assets,
   and stale-while-revalidate for CDN dependencies (Tailwind, fonts).
   ===================================================================== */

const CACHE_VERSION = 'v2.0.1';
const CACHE_NAME = `solveforjas-${CACHE_VERSION}`;

// Core app shell — everything needed for the app to run offline
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',

  './favicon/favicon.ico',
  './favicon/favicon-96x96.png',
  './favicon/favicon.svg',
  './favicon/apple-touch-icon.png',

  './favicon/icon-192.png',
  './favicon/icon-512.png',
  './favicon/icon-maskable-192.png',
  './favicon/icon-maskable-512.png',
];

/* ---------------------------------------------------------------------
   INSTALL — pre-cache the app shell
   --------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            // Don't fail the whole install if one optional asset is missing
            console.warn('[SW] Could not cache', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

/* ---------------------------------------------------------------------
   ACTIVATE — clean up old caches
   --------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('solveforjas-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ---------------------------------------------------------------------
   FETCH — routing strategy
   - Same-origin app shell files: cache-first, fallback to network
   - Cross-origin (Tailwind CDN, Google Fonts): stale-while-revalidate
   - Navigation requests: cache-first fallback to index.html (SPA-style)
   --------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Navigation requests (page loads) — try cache, fall back to network, then index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        return (
          cached ||
          fetch(request).catch(() => caches.match('./index.html'))
        );
      })
    );
    return;
  }

  if (isSameOrigin) {
    // Cache-first for app shell assets
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => caches.match('./index.html'));
      })
    );
  } else {
    // Stale-while-revalidate for CDN resources (Tailwind, Google Fonts)
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
  }
});