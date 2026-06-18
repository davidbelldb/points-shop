/* Sneaky Points service worker — push notifications + runtime caching.

   Caching strategy (deliberately conservative so deploys are never stale):
   - /assets/*  → cache-first. Vite content-hashes these filenames, so a
                  cached entry can never be wrong.
   - navigations → network-first, falling back to the last good shell when
                  offline. The fresh index.html always wins when online.
   - /api/* and /media/* are untouched (media has HTTP immutable caching). */

const ASSET_CACHE  = 'sneaky-assets-v6';
const SHELL_CACHE  = 'sneaky-shell-v6';
const MODEL_CACHE  = 'sneaky-models-v6';
const MEDIA_CACHE  = 'sneaky-media-v6';

// Large static files that are expensive to re-download.
// Cache-first forever (filenames never change).
const MODEL_EXTS = ['.glb', '.gltf', '.stl', '.bin'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Enable navigation preload so the network request for a navigation starts
    // in parallel with the worker booting — cuts first-navigation latency and
    // reduces the transient failures that showed up as "Load failed".
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch { /* unsupported */ }
    }
    // Drop caches from older versions of this worker (this includes the v5
    // asset cache, so a stale chunk from a previous deploy can't survive).
    const keep = new Set([ASSET_CACHE, SHELL_CACHE, MODEL_CACHE, MEDIA_CACHE]);
    for (const key of await caches.keys()) {
      if (key.startsWith('sneaky-') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API responses

  // Hashed build assets — cache-first, immutable by construction.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Large 3D model files — cache-first, permanent. These never change after
  // deploy and are expensive to re-download (twirl.glb = 8 MB).
  if (MODEL_EXTS.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith((async () => {
      const cache = await caches.open(MODEL_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Uploaded media (story photos/videos, product images, profile photos, chat
  // photos, voice notes) — cache-first. The backend marks these immutable with
  // content-hashed filenames so a cached entry can never be stale.
  // Cap the media cache at 200 entries so it doesn't grow without bound.
  if (url.pathname.startsWith('/media/')) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        // Evict oldest entries if cache is getting large
        const keys = await cache.keys();
        if (keys.length >= 200) await cache.delete(keys[0]);
        cache.put(req, res.clone());
      }
      return res;
    })());
    return;
  }

  // App navigations — network-first (the fresh index.html always wins online,
  // so a new deploy is picked up immediately) with offline fallback to the last
  // good shell. Uses the navigation preload response when present.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // event.preloadResponse resolves to the preloaded navigation request,
        // or undefined when preload is unsupported/disabled.
        const preloaded = await event.preloadResponse;
        const res = preloaded || await fetch(req);
        // Only cache a genuinely good HTML shell — never persist a 5xx served
        // mid-deploy, which is what previously left a broken page cached.
        if (res && res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/index.html', res.clone());
        }
        return res;
      } catch {
        // Offline (or the network errored) — fall back to the last good shell.
        const fallback = await caches.match('/index.html', { ignoreSearch: true });
        return fallback ?? new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;'
          + 'font:16px system-ui;background:#1f1f1e;color:#9ca3af">You appear to be offline. Pull to refresh when you\'re back.</body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }
    })());
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

  // Clear action — close any visible notifications with the matching tag.
  // Supported on Android/Chrome. iOS PWA does not support getNotifications().
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
