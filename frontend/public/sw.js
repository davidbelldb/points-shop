/* Sneaky Points service worker — push notifications + runtime caching.

   Caching strategy (deliberately conservative so deploys are never stale):
   - /assets/*  → cache-first. Vite content-hashes these filenames, so a
                  cached entry can never be wrong.
   - navigations → network-first, falling back to the last good shell when
                  offline. The fresh index.html always wins when online.
   - /api/* and /media/* are untouched (media has HTTP immutable caching). */

const ASSET_CACHE = 'sneaky-assets-v2';
const SHELL_CACHE = 'sneaky-shell-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop caches from older versions of this worker.
    const keep = new Set([ASSET_CACHE, SHELL_CACHE]);
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
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;

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

  // App navigations — network-first with offline fallback to the last shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/index.html', res.clone());
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
