const CACHE_NAME = 'light-note-pwa-v1';
const OFFLINE_URL = '/pwa-offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/icon-192.png?v=7'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      self.registration.navigationPreload?.enable(),
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith('light-note-pwa-') && cacheName !== CACHE_NAME)
              .map((cacheName) => caches.delete(cacheName)),
          ),
        ),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  event.respondWith(
    (async () => {
      try {
        const preloadResponse = await event.preloadResponse;
        return preloadResponse || (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
