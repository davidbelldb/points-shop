/* Sneaky Points service worker — push notifications + runtime caching.

   Caching strategy:
   - /assets/*  → cache-first. Vite content-hashes filenames, cached entry is never wrong.
   - /media/*   → cache-first. Backend serves unique immutable filenames (365d).
   - *.glb/stl  → cache-first. 3D models never change after deploy.
   - navigations → network-first, offline fallback to last good shell.
   - /api/*      → bypassed entirely, never cached.

   iOS / Safari performance notes (why this file is shaped the way it is):
   - WebKit's CacheStorage has high per-request overhead, so the response is
     ALWAYS returned before any write. Cache writes happen off the hot path via
     event.waitUntil — the user never waits on a cache.put.
   - We never call cache.keys() on the hot path. Eviction is bulk + lazy: it runs
     only once every TRIM_EVERY writes, and trims a big batch at once.
   - The media cache is generous (MEDIA_MAX) and lives in its own bucket so
     stories/products/avatars/chat don't evict each other on every navigation.
   - Range requests (audio notes / video on iOS arrive as 206) are passed
     straight through — the Cache API can't store a 206 and must not block them. */

const VERSION     = 'v4';
const ASSET_CACHE = `sneaky-assets-${VERSION}`;
const SHELL_CACHE = `sneaky-shell-${VERSION}`;
const MEDIA_CACHE = `sneaky-media-${VERSION}`;
const MODEL_CACHE = `sneaky-models-${VERSION}`;

const MODEL_EXTS = ['.glb', '.gltf', '.stl', '.bin'];

// Media cache sizing. Generous cap so normal browsing never thrashes; when we do
// trim we drop a batch (oldest-first) rather than one entry per request.
const MEDIA_MAX  = 1500;   // hard ceiling before a trim is triggered
const MEDIA_KEEP = 1200;   // trim back down to this many
const TRIM_EVERY = 80;     // only consider trimming once every N media writes
let   mediaWrites = 0;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([ASSET_CACHE, SHELL_CACHE, MEDIA_CACHE, MODEL_CACHE]);
    for (const key of await caches.keys()) {
      if (key.startsWith('sneaky-') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// Cache-first read. Returns the cached response instantly on a hit; on a miss it
// returns the network response immediately and writes to cache in the background
// (off the hot path) so the user never blocks on CacheStorage.
function cacheFirst(event, cacheName) {
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res && res.status === 200 && res.type === 'basic') {
      event.waitUntil(cache.put(event.request, res.clone()).catch(() => {}));
    }
    return res;
  })());
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Range requests (iOS media playback) must pass straight through — the Cache
  // API can't store a 206 and intercepting them breaks audio/video seeking.
  if (req.headers.has('range')) return;

  // Hashed build assets — cache-first, immutable.
  if (url.pathname.startsWith('/assets/')) {
    cacheFirst(event, ASSET_CACHE);
    return;
  }

  // 3D models — cache-first, permanent (filenames never change).
  if (MODEL_EXTS.some(ext => url.pathname.endsWith(ext))) {
    cacheFirst(event, MODEL_CACHE);
    return;
  }

  // Uploaded media — cache-first. Hit returns instantly; write + lazy bulk
  // eviction happen in the background so navigating never waits on the cache.
  if (url.pathname.startsWith('/media/')) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        event.waitUntil((async () => {
          try {
            await cache.put(req, res.clone());
            // Only enumerate/evict occasionally — never on every request.
            if (++mediaWrites % TRIM_EVERY === 0) {
              const keys = await cache.keys();
              if (keys.length > MEDIA_MAX) {
                const drop = keys.slice(0, keys.length - MEDIA_KEEP);
                await Promise.all(drop.map((k) => cache.delete(k)));
              }
            }
          } catch { /* ignore cache write failures */ }
        })());
      }
      return res;
    })());
    return;
  }

  // App navigations — network-first, offline fallback to cached shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(
            caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)).catch(() => {}),
          );
        }
        return res;
      } catch {
        const fallback = await caches.match('/index.html');
        return fallback ?? Response.error();
      }
    })());
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

  if (data.action === 'clear') {
    const tag = data.tag || 'sneaky-broadcast';
    event.waitUntil(
      self.registration.getNotifications({ tag }).then((list) => {
        list.forEach((n) => n.close());
      }).catch(() => {}),
    );
    return;
  }

  const title = data.title || 'Sneaky Stuff';
  const options = {
    body: data.body || '',
    icon: '/icon-512.png',
    badge: '/icon-512.png',
    tag: data.tag || 'sneaky-broadcast',
    renotify: true,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) { client.navigate(url).catch(() => {}); }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
