/* ============================================================
   SwipperPay service worker.
   Bump CACHE whenever the app shell changes so clients update.
   Paths are relative so this works on GitHub Pages subpaths too.
   ============================================================ */
const CACHE = 'swipperpay-v2';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll() rejects the whole batch if any single file 404s, so add
      // them individually and let optional assets fail quietly.
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navigations: network first so a deployed update is picked up, falling
  // back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Assets: cache first, then refresh the copy in the background.
  event.respondWith(
    caches.match(request).then(hit => {
      const fetched = fetch(request)
        .then(response => {
          if (response && response.ok) {
            caches.open(CACHE).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => hit);
      return hit || fetched;
    })
  );
});
