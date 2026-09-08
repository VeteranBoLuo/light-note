const CACHE_NAME = 'light-note-pwa-v2';
const OFFLINE_URL = '/pwa-offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/icon-192.png?v=7'];
const OFFLINE_STATIC_PATHS = new Set(['/icon-192.png']);

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
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin && OFFLINE_STATIC_PATHS.has(requestUrl.pathname)) {
    event.respondWith(
      (async () => {
        return (await caches.match(event.request, { ignoreSearch: true })) || fetch(event.request);
      })(),
    );
    return;
  }

  if (event.request.mode !== 'navigate') return;
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

// Push state contains only this installation's binding and short-lived dedup IDs.
// No notification bodies or private API responses are cached.
function pushStore(mode, operation) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('light-note-push', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('state');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('state', mode);
      const request = operation(tx.objectStore('state'));
      tx.oncomplete = () => {
        db.close();
        resolve(request?.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
const readPushBinding = () => pushStore('readonly', (store) => store.get('binding'));
const matchesBinding = (binding, data) =>
  binding &&
  binding.id === data.subscriptionId &&
  binding.generation === data.generation &&
  binding.userId === data.userId;
let pushSerial = Promise.resolve();
function serializePush(action) {
  const result = pushSerial.then(action);
  pushSerial = result.catch(() => {});
  return result;
}
self.addEventListener('message', (event) => {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (!['push.binding.get', 'push.binding.set'].includes(event.data?.type)) return;
  event.waitUntil(
    serializePush(async () => {
      if (event.data.type === 'push.binding.set') {
        const binding = event.data.binding || null;
        await pushStore('readwrite', (store) => store.put(binding, 'binding'));
        for (const notification of await self.registration.getNotifications()) {
          if (!matchesBinding(binding, notification.data || {})) notification.close();
        }
      }
      event.ports[0]?.postMessage({ binding: await readPushBinding() });
    }).catch(() => event.ports[0]?.postMessage({ error: 'PUSH_STORAGE_FAILED' })),
  );
});
self.addEventListener('push', (event) => {
  event.waitUntil(
    serializePush(async () => {
      let data;
      try {
        data = event.data?.json();
      } catch {
        return;
      }
      if (data?.version !== 1 || !/^[a-f0-9-]{36}$/i.test(data.notificationId || '')) return;
      if (!matchesBinding(await readPushBinding(), data)) return;
      const key = `${data.generation}:${data.notificationId}`;
      const seen = (await pushStore('readonly', (store) => store.get('seen'))) || {};
      if (seen[key]) return;
      await self.registration.showNotification(data.title || '轻笺', {
        body: data.body || '',
        icon: '/icon-192.png?v=7',
        tag: `light-note:${key}`,
        renotify: false,
        data: {
          notificationId: data.notificationId,
          subscriptionId: data.subscriptionId,
          generation: data.generation,
          userId: data.userId,
        },
      });
      seen[key] = Date.now();
      for (const id of Object.keys(seen)) if (seen[id] < Date.now() - 2 * 86400000) delete seen[id];
      await pushStore('readwrite', (store) => store.put(seen, 'seen'));
      for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
        client.postMessage({ type: 'push.received', userId: data.userId });
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    serializePush(async () => {
      const data = event.notification.data || {};
      if (!matchesBinding(await readPushBinding(), data)) return;
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client =
        clients.find((item) => item.focused && new URL(item.url).origin === self.location.origin) ||
        clients.find((item) => new URL(item.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        // Acknowledgement avoids losing a click while an existing tab is still booting.
        const delivered = await new Promise((resolve) => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => resolve(false), 1500);
          channel.port1.onmessage = (event) => {
            clearTimeout(timeout);
            channel.port1.close();
            resolve(event.data === 'handled');
          };
          client.postMessage({ type: 'push.open', ...data }, [channel.port2]);
        });
        if (delivered) return;
      }
      const url = `/notifications?notificationId=${encodeURIComponent(data.notificationId)}&pushOwner=${encodeURIComponent(data.userId)}`;
      if (client) await client.navigate(url);
      else await self.clients.openWindow(url);
    }),
  );
});
