import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

const RINGTONE_URL = '/gamecube-marimba.m4r';

function AnswerIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

/**
 * IncomingCallBanner — app-wide SneakyTime ring.
 *
 * Polls /api/calls/status and slides a tappable banner over whatever page
 * the user is on; tapping navigates to /sneakytime?join=1 which answers
 * the call. Hidden on /sneakytime itself — that page has its own Answer UI
 * (and its own ringtone, so we'd double-ring).
 */
export default function IncomingCallBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const onCallPage = location.pathname.startsWith('/sneakytime');

  const [incoming, setIncoming] = useState(false);
  const [fromName, setFromName] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);

  // Poll the ring state everywhere except the call page.
  useEffect(() => {
    if (onCallPage) { setIncoming(false); return; }
    let stopped = false;
    const check = async () => {
      try {
        const { incoming: ringing, from } = await api.callsStatus();
        if (stopped) return;
        setIncoming(ringing);
        if (ringing) setFromName(from);
      } catch { /* ignore */ }
    };
    check();
    // 8s keeps the battery/network cost low while still catching a ring
    // well inside its 45s window (the push notification is the instant path).
    const t = setInterval(check, 8000);
    return () => { stopped = true; clearInterval(t); };
  }, [onCallPage]);

  // Grab the partner's photo for the banner (once, lazily).
  useEffect(() => {
    if (!incoming || photoUrl !== null) return;
    api.callsPlayers()
      .then(({ other }) => setPhotoUrl(other?.photo_url ?? ''))
      .catch(() => setPhotoUrl(''));
  }, [incoming, photoUrl]);

  // Ringtone + vibration while ringing.
  useEffect(() => {
    if (!incoming) return;
    const audio = new Audio(RINGTONE_URL);
    audio.loop = true;
    audio.volume = 0.7;
    audio.play().catch(() => { /* autoplay blocked — banner still shows */ });
    navigator.vibrate?.([400, 250, 400]);
    const vib = setInterval(() => navigator.vibrate?.([400, 250, 400]), 2000);
    return () => {
      audio.pause();
      audio.src = '';
      clearInterval(vib);
      navigator.vibrate?.(0);
    };
  }, [incoming]);

  if (!incoming || onCallPage) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/sneakytime?join=1')}
      className="fixed inset-x-3 top-3 z-[70] flex items-center gap-3 rounded-2xl bg-[#171717]/95 px-4 py-3 text-left shadow-2xl ring-1 ring-white/15 backdrop-blur transition active:scale-[0.98] animate-[sneakyBannerIn_250ms_ease-out] sm:left-auto sm:right-4 sm:w-80"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <style>{`
        @keyframes sneakyBannerIn { from { transform: translateY(-120%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-pink-400">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-pink-200 font-bold text-pink-900">
            {(fromName ?? '?').slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-white">
          SneakyTime call from {fromName ?? 'someone'}
        </span>
        <span className="block text-xs text-white/70">Tap to answer</span>
      </span>
      <span className="flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-[#34c759] text-white">
        <AnswerIcon className="h-5 w-5" />
      </span>
    </button>
  );
}
