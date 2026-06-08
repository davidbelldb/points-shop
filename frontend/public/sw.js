/* Sneaky Points service worker — push notifications only (no offline caching). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
