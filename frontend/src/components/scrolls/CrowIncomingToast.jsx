import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { startCrowActivity, landCrowActivity } from '../../lib/crowActivity.js';

/* In-app "Live Activity": while a crow is in flight to you, a pill sits under
   the header showing how far along its journey it is. The crow walks/flies a
   start→end line, cycling through the send + land sprite frames, with a
   countdown to arrival. Tapping it jumps to chat. */

const POLL_MS = 15000;

// Crow flight sprite sequence: send_03 → send_12, then land_00 → land_10.
const FRAMES = [
  ...Array.from({ length: 10 }, (_, i) => `crow_send_${String(i + 3).padStart(2, '0')}`),
  ...Array.from({ length: 11 }, (_, i) => `crow_land_${String(i).padStart(2, '0')}`),
];

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
  const [arriveAt, setArriveAt] = useState(null); // ms timestamp of arrival
  const [startAt, setStartAt] = useState(null);   // ms timestamp the crow set off
  const [origin, setOrigin] = useState('afar');
  const [dest, setDest] = useState('');
  const [now, setNow] = useState(Date.now());
  const firedForRef = useRef(null);   // arriveAt we've already announced as landed
  const activityForRef = useRef(null); // arriveAt we've already started a Live Activity for

  const fetchIncoming = useCallback(async () => {
    try {
      const { incoming } = await api.scrolls.incoming();
      const soonest = (incoming ?? [])[0];
      if (soonest?.deliver_at) {
        const arrive = new Date(soonest.deliver_at).getTime();
        setArriveAt(arrive);
        setStartAt(arrive - (Number(soonest.flight_seconds) || 0) * 1000);
        setOrigin(soonest.origin_label || 'afar');
        setDest(soonest.dest_label || '');
      } else {
        setArriveAt(null);
      }
    } catch { /* transient */ }
  }, []);

  // Kick off the native Live Activity once per inbound crow (foreground start).
  useEffect(() => {
    if (arriveAt == null) return;
    if (activityForRef.current === arriveAt) return;
    const remainingSec = (arriveAt - Date.now()) / 1000;
    if (remainingSec <= 1) return; // already (almost) here — no point
    activityForRef.current = arriveAt;
    startCrowActivity({ seconds: remainingSec, origin, dest });
  }, [arriveAt, origin, dest]);

  useEffect(() => {
    fetchIncoming();
    const id = setInterval(fetchIncoming, POLL_MS);
    return () => clearInterval(id);
  }, [fetchIncoming]);

  // Tick the journey each second while a crow is inbound.
  useEffect(() => {
    if (arriveAt == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [arriveAt]);

  // The moment it lands, tell the rest of the app to refresh its scroll unread
  // count (bubble + chat update instantly), then refetch so the delivered crow
  // drops out and the "News from …" title doesn't linger.
  useEffect(() => {
    if (arriveAt == null) return undefined;
    if (now >= arriveAt && firedForRef.current !== arriveAt) {
      firedForRef.current = arriveAt;
      window.dispatchEvent(new Event('scrolls:refresh'));
      landCrowActivity(); // flip the Live Activity to "arrived", then it dismisses
      const t = setTimeout(fetchIncoming, 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [arriveAt, now, fetchIncoming]);

  if (arriveAt == null) return null;

  const total = Math.max(1, arriveAt - (startAt ?? arriveAt));
  const elapsed = now - (startAt ?? arriveAt);
  const progress = Math.max(0, Math.min(1, elapsed / total));
  const remaining = (arriveAt - now) / 1000;
  const arrived = remaining <= 0;
  const frame = FRAMES[Math.round(progress * (FRAMES.length - 1))];
  const title = arrived ? `News from ${origin}.` : `News travels from ${origin}`;

  return (
    <button
      type="button"
      onClick={() => navigate('/messages')}
      className="fixed left-1/2 z-[44] -translate-x-1/2 rounded-3xl px-5 py-3 shadow-xl active:scale-[0.98]"
      style={{ top: 'calc(var(--app-header-h, 56px) + 8px)', background: '#112f2a' }}
      aria-label={`${title}${arrived ? '' : `, arriving in ${fmt(remaining)}`}`}
    >
      <div style={{ width: 'min(88vw, 460px)' }}>
        <p className="truncate px-2 text-center text-sm font-semibold text-white">{title}</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="relative h-6 flex-1">
            <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full" style={{ background: '#168e77' }} />
            <img
              src={`/scrolls/${frame}.png`}
              alt=""
              className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 object-contain"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
          <span className="shrink-0 tabular-nums text-sm font-semibold text-white">{fmt(remaining)}</span>
        </div>
      </div>
    </button>
  );
}
