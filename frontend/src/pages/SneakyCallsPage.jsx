import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSneakyCall } from '../lib/useSneakyCall.js';

// ─── styling constants ────────────────────────────────────────────────────────
// Bright teal accent — uses the remapped amber palette, which index.css
// deliberately keeps saturated in BOTH light and dark mode (the teal-*
// palette gets flipped to muted dark green by html.dark overrides).
const TEAL_BTN =
  'inline-flex items-center justify-center rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-500 active:scale-95 disabled:opacity-40';

// End-call button — dark maroon with soft pink text (per design reference).
const END_CALL_BTN =
  'inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-[#3B1D1D] px-6 py-3 text-base font-bold text-[#F2B8B5] transition hover:bg-[#4A2424] active:scale-95';

const CTRL_BTN =
  'flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95';

// ─── filters — applied as CSS locally; the partner is told via a 'filter'
// signal so their device renders our feed the same way ───────────────────────
const FILTERS = [
  { id: 'none',    label: 'None',    css: 'none' },
  { id: 'noir',    label: 'Noir',    css: 'grayscale(1) contrast(1.15)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.55) contrast(1.05) saturate(1.3)' },
  { id: 'pop',     label: 'Pop',     css: 'saturate(1.9) contrast(1.1)' },
  { id: 'dreamy',  label: 'Dreamy',  css: 'brightness(1.12) saturate(1.25) blur(1px)' },
];
const filterCss = (id) => FILTERS.find((f) => f.id === id)?.css ?? 'none';

// ─── icons (shared style with Tic-Tac-Face call controls) ─────────────────────
const ICON_PROPS = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function MicIcon({ off = false, className = '' }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function CameraIcon({ off = false, className = '' }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
      {off && <line x1="2" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function HangupIcon({ className = '' }) {
  return (
    <svg {...ICON_PROPS} fill="currentColor" stroke="none" className={className} style={{ transform: 'rotate(135deg)' }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function VideoIcon({ className = '' }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
    </svg>
  );
}

// ─── VideoCell — binds a MediaStream to a <video> ─────────────────────────────
function VideoCell({ stream, mirror = false, muted = false, filter = 'none' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    if (stream) el.play().catch(() => {});
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      style={filter !== 'none' ? { filter } : undefined}
      className={`h-full w-full object-cover${mirror ? ' scale-x-[-1]' : ''}`}
    />
  );
}

// ─── Avatar fallback ──────────────────────────────────────────────────────────
function Avatar({ person, className = '' }) {
  const initial = (person?.name ?? '?').slice(0, 1).toUpperCase();
  if (person?.photo_url) {
    return <img src={person.photo_url} alt="" className={`object-cover ${className}`} />;
  }
  return (
    <span className={`flex items-center justify-center bg-pink-200 font-bold text-pink-900 ${className}`}>
      {initial}
    </span>
  );
}

// ─── FilterBar — pill picker, designed to overlay video ──────────────────────
function FilterBar({ value, onChange }) {
  return (
    <div className="flex max-w-full items-center gap-2 overflow-x-auto px-2 py-1">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
            value === f.id
              ? 'bg-amber-400 text-amber-950'
              : 'bg-white/15 text-white hover:bg-white/25'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────
export default function SneakyCallsPage() {
  const [searchParams] = useSearchParams();
  const joining = searchParams.get('join') === '1';

  const {
    localStream, remoteStream, status, remoteCamOn, remoteFilter,
    startCall, endCall, setLocalCam, setLocalMic, sendFilter,
  } = useSneakyCall();

  const [players, setPlayers] = useState(null);
  const [error, setError]     = useState(null);
  const [busy, setBusy]       = useState(false);
  const [micOn, setMicOn]     = useState(true);
  const [camOn, setCamOn]     = useState(true);
  const [filter, setFilter]   = useState('none');

  const other = players?.other ?? null;

  const inCall = status === 'ringing' || status === 'connecting' || status === 'connected';
  const remoteHasVideo = !!remoteStream?.getVideoTracks().length;
  const answered = remoteHasVideo || status === 'connected';
  const showRemoteVideo = remoteHasVideo && remoteCamOn;
  const waitingLabel = status === 'ringing' ? 'Ringing…' : 'Connecting…';

  useEffect(() => {
    api.callsPlayers().then(setPlayers).catch((e) => setError(e.message));
  }, []);

  // ── FaceTime-style lobby preview — front camera live from the moment the
  // page opens (video only; mic stays off until a call actually starts) ──────
  const previewRef = useRef(null);
  const [previewStream, setPreviewStream] = useState(null);

  useEffect(() => {
    if (inCall || busy) return;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        previewRef.current = s;
        setPreviewStream(s);
      })
      .catch(() => { /* preview blocked — card lobby fallback renders instead */ });
    return () => {
      cancelled = true;
      previewRef.current?.getTracks().forEach((t) => t.stop());
      previewRef.current = null;
      setPreviewStream(null);
    };
  }, [inCall, busy]);

  function stopPreview() {
    previewRef.current?.getTracks().forEach((t) => t.stop());
    previewRef.current = null;
    setPreviewStream(null);
  }

  // Reset toggles whenever a fresh local stream comes online.
  useEffect(() => {
    if (localStream) { setMicOn(true); setCamOn(true); }
  }, [localStream]);

  // Tapped the "Tap to Join!" notification — join straight away.
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (joining && !autoJoinedRef.current) {
      autoJoinedRef.current = true;
      join();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joining]);

  // Keep the partner's render of our feed in sync with our chosen filter.
  useEffect(() => {
    if (status === 'connected') sendFilter(filter);
  }, [filter, status, sendFilter]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    stopPreview(); // release the camera for the call's own stream
    try {
      await startCall(true);          // camera first, so we don't ring on a blocked cam
      await api.callsRing();          // then fire the "SneakyTime call from {name}" push
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    stopPreview();
    try {
      await startCall(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    setMicOn((prev) => {
      const next = !prev;
      setLocalMic(next);
      return next;
    });
  }

  function toggleCam() {
    setCamOn((prev) => {
      const next = !prev;
      setLocalCam(next);
      return next;
    });
  }

  const myFilterCss = filterCss(filter);

  // ── lobby (full-screen self preview, FaceTime style) ───────────────────────
  if (!inCall && previewStream) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-black">
        <VideoCell stream={previewStream} mirror muted filter={myFilterCss} />

        {/* Top banner — back link + partner identity */}
        <div
          className="absolute inset-x-0 top-0 flex flex-col items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-6 pb-10 pt-6"
          style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
        >
          <Link to="/" className="absolute left-4 top-[max(1.5rem,env(safe-area-inset-top))] text-sm text-white/80">
            Back
          </Link>
          <span className="block h-14 w-14 overflow-hidden rounded-full ring-2 ring-pink-400">
            <Avatar person={other} className="h-full w-full" />
          </span>
          <p className="text-sm font-semibold text-white">{other?.name ?? '…'}</p>
          <p className="text-xs text-white/70">
            {status === 'ended' ? 'Call ended' : 'Ready for some SneakyTime?'}
          </p>
        </div>

        {/* Bottom controls — filters + start */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-6 pt-10"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          {error && (
            <p className="rounded-xl bg-black/60 px-4 py-2 text-center text-sm text-[#F2B8B5]">{error}</p>
          )}
          <FilterBar value={filter} onChange={setFilter} />
          <button type="button" onClick={start} disabled={busy || !other} className={TEAL_BTN}>
            <VideoIcon className="mr-2 h-4 w-4" />
            {status === 'ended' ? 'Call Again' : 'Start SneakyTime'}
          </button>
          <button
            type="button"
            onClick={join}
            disabled={busy}
            className="text-xs text-white/60 underline-offset-2 transition hover:text-white/90 hover:underline"
          >
            Joining a call? Tap here
          </button>
        </div>
      </div>
    );
  }

  // ── lobby fallback — camera not available (blocked or still loading) ───────
  if (!inCall) {
    return (
      <div className="space-y-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">SneakyTime</h1>
            <p className="text-sm text-neutral-500">FaceTime, but sneakier.</p>
          </div>
          <Link to="/" className="text-sm text-neutral-500">Back</Link>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col items-center gap-5 rounded-3xl bg-white px-6 py-12 text-center shadow-lg">
          <span className="block h-28 w-28 overflow-hidden rounded-full ring-4 ring-pink-400">
            <Avatar person={other} className="h-full w-full" />
          </span>
          <div>
            <p className="text-lg font-semibold text-neutral-900">{other?.name ?? '…'}</p>
            <p className="text-sm text-neutral-500">
              {status === 'ended' ? 'Call ended' : 'Ready for some SneakyTime?'}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={start} disabled={busy || !other} className={TEAL_BTN}>
              <VideoIcon className="mr-2 h-4 w-4" />
              {status === 'ended' ? 'Call Again' : 'Start SneakyTime'}
            </button>
            <button
              type="button"
              onClick={join}
              disabled={busy}
              className="text-xs text-neutral-500 underline-offset-2 transition hover:text-neutral-700 hover:underline"
            >
              Joining a call? Tap here
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── live call stage — full-screen overlay, FaceTime style ──────────────────
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black">
      {/* Full-screen layer:
          - while ringing/connecting → YOUR camera fills the screen
          - once answered           → THEIR feed fills the screen */}
      {!answered ? (
        camOn && localStream ? (
          <VideoCell stream={localStream} mirror muted filter={myFilterCss} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#171717]">
            <span className="block h-28 w-28 overflow-hidden rounded-full ring-4 ring-pink-400">
              <Avatar person={players?.me} className="h-full w-full" />
            </span>
          </div>
        )
      ) : showRemoteVideo ? (
        <VideoCell stream={remoteStream} filter={filterCss(remoteFilter)} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#171717]">
          <span className="block h-28 w-28 overflow-hidden rounded-full ring-4 ring-pink-400">
            <Avatar person={other} className="h-full w-full" />
          </span>
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">Camera off</p>
        </div>
      )}

      {/* Ringing banner — partner avatar + status, while waiting for them */}
      {!answered && (
        <div
          className="absolute inset-x-0 top-0 flex flex-col items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-6 pb-10 pt-6"
          style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
        >
          <span className="block h-14 w-14 overflow-hidden rounded-full ring-2 ring-pink-400">
            <Avatar person={other} className="h-full w-full" />
          </span>
          <p className="text-sm font-semibold text-white">{other?.name ?? '…'}</p>
          <p className="animate-pulse text-xs font-bold uppercase tracking-widest text-white/70">{waitingLabel}</p>
        </div>
      )}

      {/* Local PiP — appears once they've answered, selfie-mirrored, rounded */}
      {answered && localStream && (
        <div
          className="absolute right-3 h-36 w-24 overflow-hidden rounded-2xl bg-black/60 shadow-lg ring-2 ring-white/20 sm:h-44 sm:w-32"
          style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          {camOn
            ? <VideoCell stream={localStream} mirror muted filter={myFilterCss} />
            : <Avatar person={players?.me} className="h-full w-full" />}
        </div>
      )}

      {/* Control bar */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-6 pt-10"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <FilterBar value={filter} onChange={setFilter} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            className={`${CTRL_BTN} ${micOn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[#ffffff] text-[#171717]'}`}
          >
            <MicIcon off={!micOn} className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleCam}
            title={camOn ? 'Turn camera off' : 'Turn camera on'}
            className={`${CTRL_BTN} ${camOn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-[#ffffff] text-[#171717]'}`}
          >
            <CameraIcon off={!camOn} className="h-5 w-5" />
          </button>
        </div>
        <button type="button" onClick={endCall} className={END_CALL_BTN}>
          <HangupIcon className="h-5 w-5" />
          End Call
        </button>
      </div>
    </div>
  );
}
