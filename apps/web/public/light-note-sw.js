const CACHE_NAME = 'light-note-pwa-v2';
const OFFLINE_URL = '/pwa-offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/icon-192.png?v=7'];
const OFFLINE_STATIC_PATHS = new Set(['/icon-192.png']);
// 构建产物按内容哈希命名、永不同址改写，可缓存优先；改为 false 并发布即可让所有客户端停用并清空资源缓存。
const ASSET_CACHE_ENABLED = true;
const ASSET_CACHE_PREFIX = 'light-note-assets-';
const ASSET_CACHE = `${ASSET_CACHE_PREFIX}v1`;
// 只保留当前与上一版本的资源，与服务器保留的版本范围一致。
const RELEASE_STATE_KEY = '/__light-note-sw/release-assets';
const RELEASE_MANIFEST_URL = '/.lightnote-release-assets';
// App 由原生出错页处理导航失败；分享文件等原生拦截路径也不能经过 Service Worker。
const APP_MODE = /[?&]app=1(?:&|$)/.test(self.location.search || '');

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
      // App 不接管页面导航，导航预加载只会多出一次无人使用的页面请求。
      APP_MODE ? self.registration.navigationPreload?.disable() : self.registration.navigationPreload?.enable(),
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter(
                (cacheName) =>
                  (cacheName.startsWith('light-note-pwa-') && cacheName !== CACHE_NAME) ||
                  (cacheName.startsWith(ASSET_CACHE_PREFIX) && (!ASSET_CACHE_ENABLED || cacheName !== ASSET_CACHE)),
              )
              .map((cacheName) => caches.delete(cacheName)),
          ),
        ),
    ]),
  );
});

function isAssetRequest(request, requestUrl) {
  return (
    ASSET_CACHE_ENABLED &&
    requestUrl.origin === self.location.origin &&
    requestUrl.pathname.startsWith('/assets/') &&
    request.mode !== 'navigate' &&
    !request.headers?.has?.('range')
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // 只保存完整的同源成功响应；写入失败（如配额不足）不影响本次请求。
  if (response.status === 200 && response.type === 'basic') {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (isAssetRequest(event.request, requestUrl)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  if (
    requestUrl.origin === self.location.origin &&
    requestUrl.pathname.startsWith('/manor/') &&
    event.request.mode !== 'navigate'
  ) {
    // Forward public manor subresources explicitly. In WebKit, falling through
    // a controlling fetch handler can bypass the HTTP cache on iframe reloads.
    event.respondWith(fetch(event.request));
    return;
  }
  if (requestUrl.origin === self.location.origin && OFFLINE_STATIC_PATHS.has(requestUrl.pathname)) {
    event.respondWith(
      (async () => {
        return (await caches.match(event.request, { ignoreSearch: true })) || fetch(event.request);
      })(),
    );
    return;
  }

  if (event.request.mode !== 'navigate' || APP_MODE) return;
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

async function readReleaseState(cache) {
  try {
    const stored = await cache.match(RELEASE_STATE_KEY);
    const state = stored ? await stored.json() : null;
    if (Array.isArray(state?.current) && Array.isArray(state?.previous)) return state;
  } catch {
    // 状态损坏时按首次同步处理。
  }
  return { current: [], previous: [] };
}

// 页面启动后读取线上发布清单：版本变化时把旧的当前版本降为上一版本，并删除两版之外的缓存。
async function syncReleaseAssets() {
  if (!ASSET_CACHE_ENABLED) return { enabled: false };
  const response = await fetch(RELEASE_MANIFEST_URL, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) return { enabled: true, synced: false };
  const current = (await response.text())
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^assets\/[\w./-]+$/.test(line))
    .map((line) => `/${line}`)
    .sort();
  if (!current.length) return { enabled: true, synced: false };
  const cache = await caches.open(ASSET_CACHE);
  const state = await readReleaseState(cache);
  if (state.current.join('\n') !== current.join('\n')) {
    state.previous = state.current;
    state.current = current;
    await cache.put(
      RELEASE_STATE_KEY,
      new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }),
    );
  }
  const keep = new Set([...state.current, ...state.previous, RELEASE_STATE_KEY]);
  let pruned = 0;
  for (const request of await cache.keys()) {
    if (keep.has(new URL(request.url).pathname)) continue;
    await cache.delete(request);
    pruned++;
  }
  return { enabled: true, synced: true, pruned };
}

let assetSyncSerial = Promise.resolve();
self.addEventListener('message', (event) => {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type !== 'assets.sync') return;
  const result = assetSyncSerial.then(syncReleaseAssets);
  assetSyncSerial = result.catch(() => {});
  event.waitUntil(
    result
      .then((summary) => event.ports[0]?.postMessage(summary))
      .catch(() => event.ports[0]?.postMessage({ error: 'ASSET_SYNC_FAILED' })),
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
