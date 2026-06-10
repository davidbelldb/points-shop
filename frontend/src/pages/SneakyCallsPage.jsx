import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
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

// Answer button — FaceTime green, literal hex so theming never touches it.
const ANSWER_BTN =
  'inline-flex items-center justify-center gap-2 rounded-2xl bg-[#34c759] px-8 py-3 text-base font-bold text-[#ffffff] transition hover:bg-[#2eb350] active:scale-95 disabled:opacity-40';

const CTRL_BTN =
  'flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95';
const CTRL_ON  = 'bg-white/20 text-white hover:bg-white/30';
const CTRL_LIT = 'bg-amber-400 text-amber-950';          // tray open / active
const CTRL_OFF = 'bg-[#ffffff] text-[#171717]';          // muted / cam off

// ─── filters — applied as CSS locally; the partner is told via a 'filter'
// signal so their device renders our feed the same way ───────────────────────
const FILTERS = [
  { id: 'none',    label: 'None',    css: 'none' },
  { id: 'noir',    label: 'Noir',    css: 'grayscale(1) contrast(1.15)' },
  { id: 'vibrant', label: 'Vibrant', css: 'saturate(1.45) contrast(1.06)' },
  { id: 'pop',     label: 'Pop',     css: 'saturate(1.9) contrast(1.1)' },
];
const filterCss = (id) => FILTERS.find((f) => f.id === id)?.css ?? 'none';

const FLUTTER_EMOJIS = ['💜', '🍆', '🫦', '🍑', '😂'];
const FLUTTER_COUNT = 40;
const RAIN_COUNT = 30;
const RAIN_SPREAD = 1.5;       // start-height spread (× viewport) — controls shower length
const SUPER_RAIN = { kind: 'duck', count: 100, spread: 3.5 };
const NORMAL_RAIN = (kind) => ({ kind, count: RAIN_COUNT, spread: RAIN_SPREAD });
// Popcorn: 50 pieces, fast + tight stagger ≈ a 3-second downpour.
const POPCORN_RAIN = { kind: 'popcorn', count: 50, spread: 0.8, speedMin: 5, speedMax: 7 };
const rainConfig = (kind, isSuper = false) =>
  isSuper ? SUPER_RAIN : kind === 'popcorn' ? POPCORN_RAIN : NORMAL_RAIN(kind);
const DUCK_URL = '/models/ducks/duck_7.stl';
const DUCK_COLOR = '#fcba03'; // global override — STL has no materials of its own
const RINGTONE_URL = '/gamecube-marimba.m4r';
const TEASE_BLUR = 'blur(26px)';

/** Compose a filter id + optional tease blur into a CSS filter string. */
function composeFilter(id, blurred = false) {
  const parts = [];
  const css = filterCss(id);
  if (css !== 'none') parts.push(css);
  if (blurred) parts.push(TEASE_BLUR);
  return parts.length ? parts.join(' ') : 'none';
}

// ─── icons ────────────────────────────────────────────────────────────────────
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

function AnswerIcon({ className = '' }) {
  return (
    <svg {...ICON_PROPS} fill="currentColor" stroke="none" className={className}>
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

/** Sliders — the filter tray toggle. */
function FilterIcon({ className = '' }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9"  cy="6"  r="2" fill="currentColor" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <circle cx="7"  cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

/** Smiley — the emoji flutter tray toggle. */
function SmileIcon({ className = '' }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <line x1="9" y1="9.5" x2="9.01" y2="9.5" />
      <line x1="15" y1="9.5" x2="15.01" y2="9.5" />
    </svg>
  );
}

/** Eye — tease blur toggle (slashed when hiding). */
function EyeIcon({ off = false, className = '' }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

/** Flip camera — front/rear toggle. */
function FlipIcon({ className = '' }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
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

// ─── Trays — slide-up flyouts above the control bar ───────────────────────────
function Tray({ open, children }) {
  return (
    <div
      className={`overflow-hidden transition-all duration-200 ease-out ${
        open ? 'max-h-24 translate-y-0 opacity-100' : 'max-h-0 translate-y-3 opacity-0'
      }`}
    >
      <div className="rounded-2xl bg-black/50 px-2 py-2 backdrop-blur-sm">{children}</div>
    </div>
  );
}

function FilterBar({ value, onChange }) {
  return (
    <div className="flex max-w-full items-center gap-2 overflow-x-auto px-1">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
            value === f.id ? 'bg-amber-400 text-amber-950' : 'bg-white/15 text-white hover:bg-white/25'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Spinning preview — normalises any THREE.Object3D into frame and rotates it. */
function SpinningPreview({ object }) {
  const obj = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = 1.9 / Math.max(size.x, size.y, size.z, 0.0001);
    object.scale.setScalar(s);
    object.position.copy(center).multiplyScalar(-s); // centre in frame
    return object;
  }, [object]);
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 1.4; });
  return <group ref={ref}><primitive object={obj} /></group>;
}

function TwirlThumb() {
  const { scene } = useGLTF('/twirl.glb');
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <SpinningPreview object={clone} />;
}

function PopcornThumb() {
  const { scene } = useGLTF('/popcorn.glb');
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <SpinningPreview object={clone} />;
}

function DuckThumb() {
  const duck = useGoldDuck();
  const oriented = useMemo(() => {
    const m = duck.clone(true);
    m.rotation.x = -Math.PI / 2; // STL exports are usually Z-up — stand it upright
    return m;
  }, [duck]);
  return <SpinningPreview object={oriented} />;
}

/** Tray button with a live 3D model preview inside. */
function ModelButton({ onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="shrink-0 rounded-full px-1 py-1 transition hover:bg-white/15 active:scale-90 disabled:opacity-50"
    >
      <span className="block h-9 w-9">
        <Canvas camera={{ position: [0, 0, 2.6], fov: 45 }} gl={{ alpha: true, antialias: true }}>
          <ambientLight intensity={1.2} />
          <directionalLight position={[2, 3, 4]} intensity={1.6} />
          <Suspense fallback={null}>{children}</Suspense>
        </Canvas>
      </span>
    </button>
  );
}

function EmojiBar({ onPick, onRain, onSuperRain, raining }) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto px-1">
      {FLUTTER_EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="shrink-0 rounded-full px-2 py-1 text-2xl transition hover:bg-white/15 active:scale-90"
        >
          {e}
        </button>
      ))}
      <ModelButton onClick={() => onRain('twirl')} disabled={!!raining} title="Make it rain twirls">
        <TwirlThumb />
      </ModelButton>
      <ModelButton onClick={() => onRain('duck')} disabled={!!raining} title="Make it rain ducks">
        <DuckThumb />
      </ModelButton>
      <ModelButton onClick={() => onRain('popcorn')} disabled={!!raining} title="Make it rain popcorn">
        <PopcornThumb />
      </ModelButton>
      <span className="relative shrink-0">
        <ModelButton onClick={onSuperRain} disabled={!!raining} title="SUPER rain — 100 ducks, 25 pts">
          <DuckThumb />
        </ModelButton>
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-4 text-amber-950">
          ×100
        </span>
      </span>
    </div>
  );
}

// ─── HeartPops — purple hearts popping where a double-tap landed ──────────────
function HeartPops({ hearts }) {
  if (!hearts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[56] overflow-hidden">
      <style>{`
        @keyframes sneakyHeartPop {
          0%   { transform: translate(-50%, -50%) scale(0);   opacity: 0; }
          25%  { transform: translate(-50%, -50%) scale(1.4); opacity: 1; }
          45%  { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
          100% { transform: translate(-50%, -110%) scale(1);  opacity: 0; }
        }
      `}</style>
      {hearts.map((h) => (
        <span
          key={h.id}
          className="absolute text-5xl"
          style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, animation: 'sneakyHeartPop 1.2s ease-out forwards' }}
        >
          💜
        </span>
      ))}
    </div>
  );
}

// ─── EmojiFlutter — 40 emojis fluttering up the screen ────────────────────────
function makeBurst(emoji) {
  return {
    id: `${Date.now()}-${Math.random()}`,
    emoji,
    items: Array.from({ length: FLUTTER_COUNT }, (_, k) => ({
      k,
      left: 2 + Math.random() * 92,            // vw
      dur: 2.8 + Math.random() * 2.6,          // rise duration s
      delay: Math.random() * 1.4,              // stagger s
      size: 18 + Math.random() * 26,           // px
      sway: 0.8 + Math.random() * 1.2,         // sway period s
    })),
  };
}

function EmojiFlutter({ bursts }) {
  if (!bursts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[55] overflow-hidden">
      <style>{`
        @keyframes sneakyFloatUp { 0% { transform: translateY(0); opacity: 1; } 85% { opacity: 1; } 100% { transform: translateY(-115vh); opacity: 0; } }
        @keyframes sneakySway { from { transform: translateX(-16px) rotate(-14deg); } to { transform: translateX(16px) rotate(14deg); } }
      `}</style>
      {bursts.map((b) =>
        b.items.map((it) => (
          <span
            key={`${b.id}-${it.k}`}
            className="absolute bottom-[-60px]"
            style={{ left: `${it.left}vw`, animation: `sneakyFloatUp ${it.dur}s linear ${it.delay}s forwards` }}
          >
            <span
              className="inline-block"
              style={{ fontSize: `${it.size}px`, animation: `sneakySway ${it.sway}s ease-in-out ${it.delay}s infinite alternate` }}
            >
              {b.emoji}
            </span>
          </span>
        )),
      )}
    </div>
  );
}

// ─── Model rain — objects raining top → bottom ────────────────────────────────
// Generic field: takes any THREE.Object3D template and clones it per drop.
function RainItems({ template, onDone, count = RAIN_COUNT, spread = RAIN_SPREAD, speedMin = 2.2, speedMax = 4.6 }) {
  const { viewport } = useThree();
  const doneRef = useRef(false);

  const items = useMemo(() => {
    // Normalise the model so its largest dimension is ~1 world unit.
    const box = new THREE.Box3().setFromObject(template);
    const size = new THREE.Vector3();
    box.getSize(size);
    const norm = 1 / Math.max(size.x, size.y, size.z, 0.0001);
    return Array.from({ length: count }, () => ({
      obj: template.clone(true),
      x: (Math.random() - 0.5) * viewport.width * 0.95,
      // Staggered starting heights above the top edge → rain, not a curtain.
      y: viewport.height / 2 + 1 + Math.random() * viewport.height * spread,
      speed: speedMin + Math.random() * (speedMax - speedMin),
      rx: (Math.random() - 0.5) * 3,
      ry: (Math.random() - 0.5) * 3,
      scale: norm * (0.6 + Math.random() * 0.5),
    }));
  }, [template, viewport.width, viewport.height, count, spread, speedMin, speedMax]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    let allBelow = true;
    for (const it of items) {
      it.y -= it.speed * dt;
      it.obj.position.set(it.x, it.y, 0);
      it.obj.rotation.x += it.rx * dt;
      it.obj.rotation.y += it.ry * dt;
      if (it.y > -viewport.height / 2 - 1.5) allBelow = false;
    }
    if (allBelow && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <group>
      {items.map((it, i) => (
        <primitive key={i} object={it.obj} scale={it.scale} position={[it.x, it.y, 0]} />
      ))}
    </group>
  );
}

function TwirlRainSource({ onDone, ...rest }) {
  const { scene } = useGLTF('/twirl.glb');
  return <RainItems template={scene} onDone={onDone} {...rest} />;
}

function PopcornRainSource({ onDone, ...rest }) {
  const { scene } = useGLTF('/popcorn.glb');
  return <RainItems template={scene} onDone={onDone} {...rest} />;
}

/** Gold duck — duck_7.stl with the global #fcba03 colour override. */
function useGoldDuck() {
  const geometry = useLoader(STLLoader, DUCK_URL);
  return useMemo(() => {
    const g = geometry.clone();
    g.computeVertexNormals();
    // Auto-centre — STL files from CAD tools are rarely origin-centred.
    g.computeBoundingBox();
    const centre = new THREE.Vector3();
    g.boundingBox.getCenter(centre);
    g.translate(-centre.x, -centre.y, -centre.z);
    const material = new THREE.MeshStandardMaterial({ color: DUCK_COLOR, roughness: 0.45, metalness: 0.15 });
    return new THREE.Mesh(g, material);
  }, [geometry]);
}

function DuckRainSource({ onDone, ...rest }) {
  const duck = useGoldDuck();
  return <RainItems template={duck} onDone={onDone} {...rest} />;
}

function RainOverlay({ rain, onDone }) {
  if (!rain) return null;
  const { kind, ...rest } = rain;
  const Source = kind === 'duck' ? DuckRainSource : kind === 'popcorn' ? PopcornRainSource : TwirlRainSource;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <Canvas camera={{ position: [0, 0, 8], fov: 50 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 5, 6]} intensity={1.6} />
        <Suspense fallback={null}>
          <Source onDone={onDone} {...rest} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload('/twirl.glb');
useGLTF.preload('/popcorn.glb');

// ─── page ─────────────────────────────────────────────────────────────────────
export default function SneakyCallsPage() {
  const [searchParams] = useSearchParams();
  const joining = searchParams.get('join') === '1';

  const {
    localStream, remoteStream, status, remoteCamOn, remoteFilter, remoteBlur,
    emojiEvent, rainEvent, tapEvent, facing,
    startCall, endCall, setLocalCam, setLocalMic, flipCamera,
    sendFilter, sendEmoji, sendRain, sendTap, sendBlur,
  } = useSneakyCall();

  const [players, setPlayers] = useState(null);
  const [error, setError]     = useState(null);
  const [busy, setBusy]       = useState(false);
  const [micOn, setMicOn]     = useState(true);
  const [camOn, setCamOn]     = useState(true);
  const [filter, setFilter]   = useState('vibrant'); // default for calls
  const [openTray, setOpenTray] = useState(null); // null | 'filters' | 'emoji'
  const [bursts, setBursts]   = useState([]);
  const [raining, setRaining] = useState(null); // null | { kind, count, spread }
  const [myBlur, setMyBlur]   = useState(false); // tease blur on MY outgoing feed
  const [hearts, setHearts]   = useState([]);    // [{ id, x, y }] purple heart pops
  const [callToast, setCallToast] = useState(null);
  const toastTimerRef = useRef(null);

  function showToast(msg) {
    setCallToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setCallToast(null), 3000);
  }

  const other = players?.other ?? null;

  const inCall = status === 'ringing' || status === 'connecting' || status === 'connected';
  const remoteHasVideo = !!remoteStream?.getVideoTracks().length;
  const answered = remoteHasVideo || status === 'connected';
  const showRemoteVideo = remoteHasVideo && remoteCamOn;
  const waitingLabel = status === 'ringing' ? 'Ringing…' : 'Connecting…';

  useEffect(() => {
    api.callsPlayers().then(setPlayers).catch((e) => setError(e.message));
  }, []);

  // ── Incoming-call ring — poll while idle so an Answer button can appear ────
  const [incoming, setIncoming] = useState(false);

  useEffect(() => {
    if (inCall) { setIncoming(false); return; }
    let stopped = false;
    const check = async () => {
      try {
        const { incoming: ringing } = await api.callsStatus();
        if (!stopped) setIncoming(ringing);
      } catch { /* ignore */ }
    };
    check();
    const t = setInterval(check, 3000);
    return () => { stopped = true; clearInterval(t); };
  }, [inCall]);

  // ── Ringtone + vibration while an incoming call is ringing ─────────────────
  useEffect(() => {
    if (!incoming) return;
    const audio = new Audio(RINGTONE_URL);
    audio.loop = true;
    audio.volume = 0.7;
    audio.play().catch(() => { /* autoplay blocked — vibration still runs */ });
    navigator.vibrate?.([400, 250, 400]);
    const vib = setInterval(() => navigator.vibrate?.([400, 250, 400]), 2000);
    return () => {
      audio.pause();
      audio.src = '';
      clearInterval(vib);
      navigator.vibrate?.(0);
    };
  }, [incoming]);

  // ── FaceTime-style lobby preview — front camera live from the moment the
  // page opens (video only; mic stays off until a call actually starts) ──────
  const previewRef = useRef(null);
  const [previewStream, setPreviewStream] = useState(null);
  const [previewFacing, setPreviewFacing] = useState('user');

  useEffect(() => {
    if (inCall || busy) return;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: previewFacing === 'environment' ? { ideal: 'environment' } : 'user' },
      audio: false,
    })
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
  }, [inCall, busy, previewFacing]);

  function stopPreview() {
    previewRef.current?.getTracks().forEach((t) => t.stop());
    previewRef.current = null;
    setPreviewStream(null);
  }

  // Reset toggles whenever a fresh local stream comes online.
  useEffect(() => {
    if (localStream) { setMicOn(true); setCamOn(true); setOpenTray(null); setMyBlur(false); }
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

  // Partner sent an emoji flutter / twirl rain — mirror it on our screen.
  useEffect(() => {
    if (emojiEvent) addBurst(emojiEvent.emoji);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emojiEvent]);

  useEffect(() => {
    if (rainEvent) {
      setRaining((cur) => cur ?? rainConfig(rainEvent.kind, rainEvent.super));
    }
  }, [rainEvent]);

  // Partner double-tapped — pop a purple heart at the same spot.
  useEffect(() => {
    if (tapEvent) popHeart(tapEvent.x, tapEvent.y);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapEvent]);

  // Keep the partner's render of our feed in sync with the tease blur.
  useEffect(() => {
    if (status === 'connected') sendBlur(myBlur);
  }, [myBlur, status, sendBlur]);

  function addBurst(emoji) {
    const burst = makeBurst(emoji);
    setBursts((prev) => [...prev, burst]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burst.id));
    }, 8000);
  }

  function pickEmoji(emoji) {
    addBurst(emoji);
    sendEmoji(emoji);
  }

  function popHeart(x, y) {
    const id = `${Date.now()}-${Math.random()}`;
    setHearts((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== id)), 1300);
  }

  // Double-tap detection on the call stage → purple heart on both screens.
  const lastTapRef = useRef({ t: 0, x: 0, y: 0 });
  function handleStageTap(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const now = Date.now();
    const last = lastTapRef.current;
    const isDouble = now - last.t < 320 && Math.abs(x - last.x) < 0.08 && Math.abs(y - last.y) < 0.08;
    lastTapRef.current = { t: now, x, y };
    if (isDouble) {
      lastTapRef.current = { t: 0, x: 0, y: 0 };
      popHeart(x, y);
      sendTap(x, y);
    }
  }

  function startRain(kind) {
    if (raining) return;
    setRaining(rainConfig(kind));
    sendRain(kind);
  }

  async function superRain() {
    if (raining) return;
    try {
      const r = await api.callsSuperRain();
      setRaining(SUPER_RAIN);
      sendRain(SUPER_RAIN.kind, true);
      showToast(`SUPER RAIN! −${r.cost} pts (${r.balance} left)`);
    } catch (e) {
      showToast(e.message);
    }
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    stopPreview(); // release the camera for the call's own stream
    try {
      await startCall(true, previewFacing);  // camera first, so we don't ring on a blocked cam
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
    setIncoming(false);
    // Clear the ring server-side; a fast pickup earns a points bonus.
    api.callsAnswer()
      .then((r) => { if (r?.bonus) showToast(`Quick answer! +${r.bonus} pts`); })
      .catch(() => {});
    stopPreview();
    try {
      await startCall(false, previewFacing);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function hangUp() {
    if (!answered) api.callsCancel().catch(() => {}); // hung up while still ringing
    endCall();
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

  function toggleTray(name) {
    setOpenTray((cur) => (cur === name ? null : name));
  }

  const myFilterCss = composeFilter(filter, myBlur);

  // ── lobby (full-screen self preview, FaceTime style) ───────────────────────
  if (!inCall && previewStream) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-black">
        <VideoCell stream={previewStream} mirror={previewFacing === 'user'} muted filter={myFilterCss} />

        {/* Top banner — back link + partner identity */}
        <div
          className="absolute inset-x-0 top-0 flex flex-col items-center gap-2 bg-gradient-to-b from-black/70 via-black/40 to-transparent px-6 pb-12 pt-6"
          style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
        >
          <Link to="/" className="absolute left-4 top-[max(1.5rem,env(safe-area-inset-top))] text-sm text-white/80">
            Back
          </Link>
          <span className={`mt-10 block h-14 w-14 overflow-hidden rounded-full ring-2 ring-pink-400 ${incoming ? 'animate-pulse' : ''}`}>
            <Avatar person={other} className="h-full w-full" />
          </span>
          <p className="text-sm font-semibold text-white">{other?.name ?? '…'}</p>
          <p className={`text-xs text-white/70 ${incoming ? 'animate-pulse font-bold' : ''}`}>
            {incoming
              ? `SneakyTime call from ${other?.name ?? 'them'}…`
              : status === 'ended' ? 'Call ended' : 'Ready for some SneakyTime?'}
          </p>
        </div>

        {/* Bottom controls — filter flyout + start */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-6 pt-10"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          {error && (
            <p className="rounded-xl bg-black/60 px-4 py-2 text-center text-sm text-[#F2B8B5]">{error}</p>
          )}
          <Tray open={openTray === 'filters'}>
            <FilterBar value={filter} onChange={setFilter} />
          </Tray>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => toggleTray('filters')}
              title="Filters"
              className={`${CTRL_BTN} ${CTRL_ON}`}
            >
              <FilterIcon className="h-5 w-5" />
            </button>
            {incoming ? (
              <button type="button" onClick={join} disabled={busy} className={`${ANSWER_BTN} h-12`}>
                <AnswerIcon className="h-5 w-5" />
                Answer
              </button>
            ) : (
              <button type="button" onClick={start} disabled={busy || !other} className={`${TEAL_BTN} h-12`}>
                <VideoIcon className="mr-2 h-4 w-4" />
                {status === 'ended' ? 'Call Again' : 'Start SneakyTime'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPreviewFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              title="Flip camera"
              className={`${CTRL_BTN} ${CTRL_ON}`}
            >
              <FlipIcon className="h-5 w-5" />
            </button>
          </div>
          {!incoming && (
            <button
              type="button"
              onClick={join}
              disabled={busy}
              className="text-xs text-white/60 underline-offset-2 transition hover:text-white/90 hover:underline"
            >
              Joining a call? Tap here
            </button>
          )}
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
          <span className={`block h-28 w-28 overflow-hidden rounded-full ring-4 ring-pink-400 ${incoming ? 'animate-pulse' : ''}`}>
            <Avatar person={other} className="h-full w-full" />
          </span>
          <div>
            <p className="text-lg font-semibold text-neutral-900">{other?.name ?? '…'}</p>
            <p className={`text-sm text-neutral-500 ${incoming ? 'animate-pulse font-semibold' : ''}`}>
              {incoming
                ? `SneakyTime call from ${other?.name ?? 'them'}…`
                : status === 'ended' ? 'Call ended' : 'Ready for some SneakyTime?'}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            {incoming ? (
              <button type="button" onClick={join} disabled={busy} className={ANSWER_BTN}>
                <AnswerIcon className="h-5 w-5" />
                Answer
              </button>
            ) : (
              <>
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
              </>
            )}
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
          <VideoCell stream={localStream} mirror={facing === 'user'} muted filter={myFilterCss} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#171717]">
            <span className="block h-28 w-28 overflow-hidden rounded-full ring-4 ring-pink-400">
              <Avatar person={players?.me} className="h-full w-full" />
            </span>
          </div>
        )
      ) : showRemoteVideo ? (
        <VideoCell stream={remoteStream} filter={composeFilter(remoteFilter, remoteBlur)} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#171717]">
          <span className="block h-28 w-28 overflow-hidden rounded-full ring-4 ring-pink-400">
            <Avatar person={other} className="h-full w-full" />
          </span>
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">Camera off</p>
        </div>
      )}

      {/* Double-tap catcher — purple heart reactions on both screens */}
      {answered && <div className="absolute inset-0" onPointerUp={handleStageTap} />}

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
            ? <VideoCell stream={localStream} mirror={facing === 'user'} muted filter={myFilterCss} />
            : <Avatar person={players?.me} className="h-full w-full" />}
        </div>
      )}

      {/* Fun overlays */}
      <EmojiFlutter bursts={bursts} />
      <HeartPops hearts={hearts} />
      <RainOverlay rain={raining} onDone={() => setRaining(null)} />

      {/* Control bar */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-6 pt-10"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <Tray open={openTray === 'filters'}>
          <FilterBar value={filter} onChange={setFilter} />
        </Tray>
        {callToast && (
          <p className="rounded-xl bg-black/60 px-4 py-2 text-center text-sm font-semibold text-white">{callToast}</p>
        )}
        <Tray open={openTray === 'emoji'}>
          <EmojiBar onPick={pickEmoji} onRain={startRain} onSuperRain={superRain} raining={raining} />
        </Tray>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleTray('filters')}
            title="Filters"
            className={`${CTRL_BTN} ${CTRL_ON}`}
          >
            <FilterIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => toggleTray('emoji')}
            title="Send emojis"
            className={`${CTRL_BTN} ${openTray === 'emoji' ? CTRL_LIT : CTRL_ON}`}
          >
            <SmileIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={flipCamera}
            title="Flip camera"
            className={`${CTRL_BTN} ${CTRL_ON}`}
          >
            <FlipIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMyBlur((b) => !b)}
            title={myBlur ? 'Reveal yourself' : 'Hide behind the blur'}
            className={`${CTRL_BTN} ${myBlur ? CTRL_OFF : CTRL_ON}`}
          >
            <EyeIcon off={myBlur} className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleMic}
            title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            className={`${CTRL_BTN} ${micOn ? CTRL_ON : CTRL_OFF}`}
          >
            <MicIcon off={!micOn} className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleCam}
            title={camOn ? 'Turn camera off' : 'Turn camera on'}
            className={`${CTRL_BTN} ${camOn ? CTRL_ON : CTRL_OFF}`}
          >
            <CameraIcon off={!camOn} className="h-5 w-5" />
          </button>
        </div>
        <button type="button" onClick={hangUp} className={END_CALL_BTN}>
          <HangupIcon className="h-5 w-5" />
          End Call
        </button>
      </div>
    </div>
  );
}
