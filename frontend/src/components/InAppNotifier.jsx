import { useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/ToastContext.jsx';

// Polls the notifications feed and raises an in-app toast for each NEW unread
// alert (game turn, order update, invites, etc.) while the app is foregrounded.
// On the first poll it records whatever already exists as "seen" so it never
// toasts history — only things that arrive after you opened the app.
const POLL_MS = 12000;

export default function InAppNotifier() {
  const { showToast } = useToast();

  useEffect(() => {
    let stopped = false;
    let seen = null; // Set of notification ids; null until the first fetch
    let timer;

    async function poll() {
      if (document.hidden || stopped) return;
      try {
        const { items = [] } = await api.getNotifications();
        if (seen === null) {
          seen = new Set(items.map((n) => n.id));
          return;
        }
        // Oldest-first so a burst toasts in arrival order.
        for (const n of [...items].reverse()) {
          if (seen.has(n.id)) continue;
          seen.add(n.id);
          if (!n.read_at) {
            showToast({ title: n.title || 'Sneaky Stuff', body: n.body, url: n.link_url || '/' });
          }
        }
      } catch { /* offline / transient — try again next tick */ }
    }

    poll();
    timer = setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [showToast]);

  return null;
}
