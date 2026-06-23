import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

/* A lightweight in-app "Live Activity": while a crow is in flight to you, a
   slim pill sits under the header counting down to its arrival (e.g.
   "Crow incoming · 4:23"). Polls /scrolls/incoming every 15s and ticks the
   countdown locally every second. Tapping it jumps to chat. Hides itself once
   the soonest crow lands (the arrival push / landing animation take over). */

const POLL_MS = 15000;

function fmt(secs) {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function CrowIncomingToast() {
  const navigate = useNavigate();
  const [arriveAt, setArriveAt] = useState(null); // ms timestamp of soonest arrival
  const [origin, setOrigin] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Poll for in-flight scrolls.
  useEffect(() => {
    let alive = true;
    const fetchIncoming = async () => {
      try {
        const { incoming } = await api.scrolls.incoming();
        if (!alive) return;
        const soonest = (incoming ?? [])[0];
        if (soonest?.deliver_at) {
          setArriveAt(new Date(soonest.deliver_at).getTime());
          setOrigin(soonest.origin_label || null);
        } else {
          setArriveAt(null);
        }
      } catch { /* transient */ }
    };
    fetchIncoming();
    const id = setInterval(fetchIncoming, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Tick the displayed countdown each second.
  useEffect(() => {
    if (arriveAt == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [arriveAt]);

  if (arriveAt == null) return null;
  const remaining = (arriveAt - now) / 1000;
  if (remaining <= 0) return null; // landed — let the arrival flow take over

  return (
    <button
      type="button"
      onClick={() => navigate('/messages')}
      className="fixed left-1/2 z-[44] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-lg backdrop-blur active:scale-95 dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100"
      style={{ top: 'calc(var(--app-header-h, 56px) + 8px)' }}
      aria-label={`Crow incoming, arriving in ${fmt(remaining)}`}
    >
      <img src="/scrolls/crow_send_02.png" alt="" className="h-6 w-6 object-contain" style={{ animation: 'ptr-jiggle 0.5s linear infinite' }} />
      <span>Crow incoming{origin ? ` from ${origin}` : ''}</span>
      <span className="tabular-nums text-amber-700 dark:text-amber-400">{fmt(remaining)}</span>
    </button>
  );
}
