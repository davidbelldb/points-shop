import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';

const UNREAD_POLL_MS = 5000;

/* Central state for the scroll feature: received scrolls, unread count, and the
   admin-tuned config (settings + send/land frame sequences). Polls the unread
   count so a freshly-arrived crow triggers the landing animation. */
export function useScrolls() {
  const [scrolls, setScrolls] = useState([]);
  const [unread, setUnread] = useState(0);
  const [config, setConfig] = useState({ settings: null, send: [], land: [] });
  const [loading, setLoading] = useState(true);
  const prevUnreadRef = useRef(0);
  const [arrivedTick, setArrivedTick] = useState(0); // bumps when unread rises

  const loadConfig = useCallback(async () => {
    try { setConfig(await api.scrolls.config()); } catch { /* keep defaults */ }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { scrolls: list, unread: n } = await api.scrolls.list();
      setScrolls(list ?? []);
      setUnread(n ?? 0);
      prevUnreadRef.current = n ?? 0;
    } catch { /* transient */ }
    finally { setLoading(false); }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const { unread: n } = await api.scrolls.unread();
      if ((n ?? 0) > prevUnreadRef.current) {
        setArrivedTick((t) => t + 1);
        refresh(); // pull the freshly-arrived scroll into the list immediately
      }
      prevUnreadRef.current = n ?? 0;
      setUnread(n ?? 0);
    } catch { /* transient */ }
  }, [refresh]);

  useEffect(() => {
    loadConfig();
    refresh();
    const id = setInterval(refreshUnread, UNREAD_POLL_MS);
    // Let other parts of the app (e.g. the incoming-crow toast on landing) force
    // an immediate unread check instead of waiting for the next poll.
    window.addEventListener('scrolls:refresh', refreshUnread);
    return () => { clearInterval(id); window.removeEventListener('scrolls:refresh', refreshUnread); };
  }, [loadConfig, refresh, refreshUnread]);

  const send = useCallback(async (payload) => {
    const scroll = await api.scrolls.send(payload);
    refreshUnread();
    return scroll;
  }, [refreshUnread]);

  // Reading a scroll removes it (ephemeral): drop it from the list locally and
  // delete it server-side.
  const markRead = useCallback(async (id) => {
    setScrolls((prev) => prev.filter((s) => s.id !== id));
    setUnread((n) => Math.max(0, n - 1));
    prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);
    try { await api.scrolls.markRead(id); } catch { /* best effort */ }
  }, []);

  return {
    scrolls, unread, config, loading, arrivedTick,
    refresh, refreshUnread, send, markRead,
  };
}
