import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useBasket } from '../lib/BasketContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import StoryViewer from '../components/stories/StoryViewer.jsx';
import SliderSticker from '../components/stories/SliderSticker.jsx';

const POLL_MS = 5000;
const DOUBLE_TAP_MS = 240;
const NUDGE_BODY = '__nudge__';

// ---------------------------------------------------------------------------
// Shake animation — injected once into the document head and triggered by
// toggling the `sneaky-shake` class on document.documentElement.
// ---------------------------------------------------------------------------
(function injectShakeStyle() {
  if (document.getElementById('sneaky-shake-style')) return;
  const style = document.createElement('style');
  style.id = 'sneaky-shake-style';
  style.textContent = `
    @keyframes sneaky-shake {
      0%   { transform: translate(0, 0) rotate(0deg); }
      5%   { transform: translate(-8px, -6px) rotate(-2deg); }
      10%  { transform: translate(9px,  5px) rotate(2deg); }
      15%  { transform: translate(-7px,  8px) rotate(-1.5deg); }
      20%  { transform: translate(8px, -7px) rotate(1.8deg); }
      25%  { transform: translate(-9px,  4px) rotate(-2.2deg); }
      30%  { transform: translate(7px,  9px) rotate(1.5deg); }
      35%  { transform: translate(-6px, -8px) rotate(-1deg); }
      40%  { transform: translate(9px,  6px) rotate(2.1deg); }
      45%  { transform: translate(-8px,  7px) rotate(-1.8deg); }
      50%  { transform: translate(6px, -6px) rotate(1.2deg); }
      55%  { transform: translate(-5px,  5px) rotate(-0.8deg); }
      60%  { transform: translate(4px, -4px) rotate(0.6deg); }
      65%  { transform: translate(-3px,  3px) rotate(-0.4deg); }
      70%  { transform: translate(2px, -2px) rotate(0.2deg); }
      75%  { transform: translate(-2px,  1px) rotate(-0.2deg); }
      80%  { transform: translate(1px, -1px) rotate(0.1deg); }
      100% { transform: translate(0, 0) rotate(0deg); }
    }
    html.sneaky-shake {
      animation: sneaky-shake 0.75s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }

    /* ── Sparkle burst (Josh W. Comeau technique) ── */
    @keyframes sparkle-come-in-out {
      0%   { transform: scale(0); }
      50%  { transform: scale(1); }
      100% { transform: scale(0); }
    }
    @keyframes sparkle-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(180deg); }
    }
  `;
  document.head.appendChild(style);
})();

function triggerShake() {
  const el = document.documentElement;
  el.classList.remove('sneaky-shake');
  // Force reflow so removing+adding the class restarts the animation.
  void el.offsetWidth;
  el.classList.add('sneaky-shake');
  setTimeout(() => el.classList.remove('sneaky-shake'), 800);
}

// ---------------------------------------------------------------------------
// Rain effects — ported from SneakyCallsPage
// ---------------------------------------------------------------------------
const DUCK_URL    = '/models/ducks/duck_7.stl';
const DUCK_COLOR  = '#fcba03';
const RAIN_COUNT  = 30;
const RAIN_SPREAD = 1.5;
const POPCORN_RAIN = { kind: 'popcorn', count: 50, spread: 0.8, speedMin: 5, speedMax: 7 };
const NORMAL_RAIN  = (kind) => ({ kind, count: RAIN_COUNT, spread: RAIN_SPREAD });
const rainConfig   = (kind) => kind === 'popcorn' ? POPCORN_RAIN : NORMAL_RAIN(kind);

const RAIN_BODY = { twirl: '__rain_twirl__', popcorn: '__rain_popcorn__', duck: '__rain_duck__' };
const RAIN_KIND_MAP = { '__rain_twirl__': 'twirl', '__rain_popcorn__': 'popcorn', '__rain_duck__': 'duck' };
const RAIN_BODIES   = new Set(Object.values(RAIN_BODY));

/** Normalise + auto-rotate any THREE.Object3D into a spinning preview. */
function SpinningPreview({ object }) {
  const obj = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = 1.9 / Math.max(size.x, size.y, size.z, 0.0001);
    object.scale.setScalar(s);
    object.position.copy(center).multiplyScalar(-s);
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

function useGoldDuck() {
  const geometry = useLoader(STLLoader, DUCK_URL);
  return useMemo(() => {
    const g = geometry.clone();
    g.computeVertexNormals();
    g.computeBoundingBox();
    const centre = new THREE.Vector3();
    g.boundingBox.getCenter(centre);
    g.translate(-centre.x, -centre.y, -centre.z);
    const material = new THREE.MeshStandardMaterial({ color: DUCK_COLOR, roughness: 0.45, metalness: 0.15 });
    return new THREE.Mesh(g, material);
  }, [geometry]);
}

function DuckThumb() {
  const duck = useGoldDuck();
  const oriented = useMemo(() => {
    const m = duck.clone(true);
    m.rotation.x = -Math.PI / 2;
    return m;
  }, [duck]);
  return <SpinningPreview object={oriented} />;
}

/** Tray button with a live spinning 3D model. */
function ModelButton({ onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="shrink-0 rounded-full p-1 transition hover:bg-neutral-100 active:scale-90 disabled:opacity-40 dark:hover:bg-neutral-800"
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

// Generic rain field — clones a template object per drop and falls top→bottom.
function RainItems({ template, onDone, count = RAIN_COUNT, spread = RAIN_SPREAD, speedMin = 2.2, speedMax = 4.6 }) {
  const { viewport } = useThree();
  const doneRef = useRef(false);
  const items = useMemo(() => {
    const box = new THREE.Box3().setFromObject(template);
    const size = new THREE.Vector3();
    box.getSize(size);
    const norm = 1 / Math.max(size.x, size.y, size.z, 0.0001);
    return Array.from({ length: count }, () => ({
      obj: template.clone(true),
      x: (Math.random() - 0.5) * viewport.width * 0.95,
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
    if (allBelow && !doneRef.current) { doneRef.current = true; onDone?.(); }
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

// ---------------------------------------------------------------------------
// Giphy GIF API — using the public beta key (rate-limited, suitable for
// low-volume personal use). Swap for a registered key from
// https://developers.giphy.com if you need higher limits.
// ---------------------------------------------------------------------------
const GIPHY_API_KEY  = import.meta.env.VITE_GIPHY_API_KEY ?? '';
const GIPHY_BASE     = 'https://api.giphy.com/v1/gifs';
const GIF_PAGE_LIMIT = 20;

// Detect whether a message body is a GIF URL we sent ourselves.
function isGifUrl(body) {
  return typeof body === 'string' && /^https?:\/\/media\d*\.giphy\.com\/.+\.gif(\?.*)?$/.test(body);
}

// Detect audio voice notes — handles both /media/ relative paths and full URLs.
function isAudioUrl(body) {
  if (typeof body !== 'string') return false;
  if (!body.startsWith('/media/') && !/^https?:\/\//.test(body)) return false;
  return /\.(mp3|ogg|webm|m4a|wav|aac|opus)(\?.*)?$/i.test(body);
}

// Detect uploaded photos — handles /media/ relative paths and full URLs.
function isUploadedPhoto(body) {
  if (typeof body !== 'string') return false;
  if (!body.startsWith('/media/') && !/^https?:\/\//.test(body)) return false;
  if (isGifUrl(body)) return false;
  return /\.(jpg|jpeg|png|gif|webp|heic|heif|avif)(\?.*)?$/i.test(body);
}

// Map stored reaction key → display emoji.
const REACTION_MAP = { heart: '💜' };
function reactionEmoji(r) { return r ? (REACTION_MAP[r] ?? r) : null; }

const EMOJI_REACTIONS = ['😂', '💜', '🍆', '🫦', '😲'];

// ---------------------------------------------------------------------------
// GIF Picker modal
// ---------------------------------------------------------------------------
function GifPicker({ onSelect, onClose }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [offset, setOffset]   = useState(0); // Giphy uses integer offset pagination
  const debounceRef           = useRef(null);
  const inputRef              = useRef(null);

  // Load trending GIFs on mount.
  useEffect(() => {
    fetchGifs('', true);
    setTimeout(() => inputRef.current?.focus(), 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchGifs(term, reset = false) {
    const nextOffset = reset ? 0 : offset;
    setLoading(true);
    setError(null);
    try {
      const endpoint = term.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(term)}&limit=${GIF_PAGE_LIMIT}&offset=${nextOffset}&rating=g`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=${GIF_PAGE_LIMIT}&offset=${nextOffset}&rating=g`;
      const res  = await fetch(endpoint);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Giphy ${res.status}: ${body.slice(0, 120)}`);
      }
      const json = await res.json();
      const items = (json.data ?? []).map((r) => ({
        id:      r.id,
        url:     r.images?.original?.url ?? r.url,
        preview: r.images?.fixed_height_small?.url ?? r.images?.original?.url,
        title:   r.title ?? '',
      }));
      setResults((prev) => reset ? items : [...prev, ...items]);
      setOffset(nextOffset + items.length);
    } catch (e) {
      console.error('[GifPicker]', e);
      setError(e.message || 'Could not load GIFs.');
    } finally {
      setLoading(false);
    }
  }

  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(val, true), 420);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="flex w-full max-w-md flex-col rounded-t-2xl bg-white sm:max-h-[80vh] sm:rounded-2xl dark:bg-neutral-900">

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-neutral-400">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            placeholder="Search GIFs…"
            className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-neutral-400 dark:text-white"
          />
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close GIF picker"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '55vh' }}>
          {error && (
            <p className="py-8 text-center text-sm text-red-500">{error}</p>
          )}
          {!error && results.length === 0 && !loading && (
            <p className="py-8 text-center text-sm text-neutral-400">No results</p>
          )}
          <div className="columns-2 gap-2 sm:columns-3">
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect(gif.url)}
                className="mb-2 block w-full overflow-hidden rounded-lg transition active:scale-95 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                title={gif.title}
              >
                <img
                  src={gif.preview}
                  alt={gif.title}
                  loading="lazy"
                  className="h-auto w-full object-cover"
                />
              </button>
            ))}
          </div>

          {/* Load more */}
          {results.length > 0 && results.length % GIF_PAGE_LIMIT === 0 && !loading && (
            <button
              onClick={() => fetchGifs(query, false)}

              className="mt-1 w-full rounded-xl border border-neutral-200 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Load more
            </button>
          )}
          {loading && (
            <div className="flex items-center justify-center py-6">
              <svg className="h-6 w-6 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          )}
        </div>

        {/* Branding */}
        <p className="px-3 py-1.5 text-[10px] text-neutral-400">
          Powered by GIPHY
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkle burst (Josh W. Comeau technique — two-layer animation)
// Outer wrapper: scale(0→1→0). Inner SVG: rotate(0→180deg). Independent easing.
// ---------------------------------------------------------------------------
const SPARKLE_COLORS = ['#FFC700', '#61dbbb', '#ed70bd', '#FFD60A', '#FF6AC1'];
const SPARKLE_PATH   = 'M26.5 25.5C19.0043 33.3697 0 34 0 34C0 34 19.1013 35.3684 26.5 43.5C33.234 50.901 34 68 34 68C34 68 36.9884 50.7065 44.5 43.5C51.6431 36.647 68 34 68 34C68 34 51.6947 32.0939 44.5 25.5C36.5605 18.2235 34 0 34 0C34 0 33.6591 17.9837 26.5 25.5Z';

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateSparkle() {
  return {
    id: String(randInt(10000, 99999)),
    createdAt: Date.now(),
    color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
    size: randInt(10, 22),
    style: {
      top:  randInt(-15, 110) + '%',
      left: randInt(-10, 110) + '%',
    },
  };
}

function SparkleInstance({ color, size, style }) {
  return (
    <span style={{
      position: 'absolute',
      display: 'block',
      pointerEvents: 'none',
      zIndex: 20,
      animation: 'sparkle-come-in-out 700ms ease-in-out forwards',
      ...style,
    }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 68 68"
        fill="none"
        style={{ display: 'block', animation: 'sparkle-spin 1000ms linear forwards' }}
      >
        <path d={SPARKLE_PATH} fill={color} />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared avatar
// ---------------------------------------------------------------------------
function Avatar({ url, name, size = 'md' }) {
  const cls = size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const iconSize = size === 'lg' ? 22 : 16;
  return (
    <div className={`flex ${cls} shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400`}>
      {url ? (
        <img src={url} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )}
    </div>
  );
}

/* Small thumbnail + caption rendered above a message body when the message
   was sent as a reply to a story. Mirrors WhatsApp/IG quote-preview layout. */
function StoryReplyPreview({ m, onClick }) {
  if (!m.story_media_url) {
    return (
      <p className="mb-1 rounded-md bg-black/10 px-2 py-1 text-[11px] italic opacity-80">
        Replied to a story (no longer available)
      </p>
    );
  }

  let respondedSticker = null;
  if (m.slider_response && Array.isArray(m.story_stickers)) {
    const idx = Number(m.slider_response.sticker_index) || 0;
    const cand = m.story_stickers[idx];
    if (cand && cand.type === 'slider') respondedSticker = cand;
  }
  return (
    <button
      data-bubble-action
      onClick={(e) => { e.stopPropagation(); onClick?.(m.reply_to_story_id); }}
      className="mb-2 flex w-full items-center gap-2 rounded-md bg-black/10 p-1.5 text-left text-xs transition hover:bg-black/15"
      aria-label="Open story"
    >
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded">
        {m.story_media_type === 'video' ? (
          <video src={m.story_media_url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
        ) : m.story_media_type === 'audio' ? (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-pink-500 via-amber-500 to-emerald-400 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </span>
        ) : (
          <img src={m.story_media_url} alt="" className="h-full w-full object-cover" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
          Replied to {m.story_author_name ?? 'a story'}
        </p>
        {m.story_caption && (
          <p className="line-clamp-1 text-[11px] opacity-80">{m.story_caption}</p>
        )}
        {respondedSticker && (
          <div className="mt-2 flex justify-center" onClick={(e) => e.stopPropagation()}>
            <SliderSticker
              sticker={respondedSticker}
              mode="response"
              response={m.slider_response}
            />
          </div>
        )}
      </div>
    </button>
  );
}

function MessageReplyPreview({ m }) {
  const snippet = (m.reply_to_body || '').trim();
  return (
    <div className="mb-2 rounded-md border-l-2 border-current/50 bg-black/10 px-2 py-1 text-xs opacity-80">
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        Replying to {m.reply_to_sender_name ?? 'a message'}
      </p>
      <p className="line-clamp-1">{snippet || 'Message no longer available'}</p>
    </div>
  );
}

function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const SWIPE_TRIGGER = 60;
const SWIPE_MAX     = 80;

function MessageBubble({ m, mine, clusterPos = 'solo', isEditing, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onForceDelete, onSetReaction, onOpenStory, onOpenPhoto, onSwipeReply }) {
  const { theme } = useTheme();
  const tapTimer  = useRef(null);
  const holdTimer = useRef(null);
  const swipeRef  = useRef(null);
  const sparkleIntervalRef = useRef(null);
  const [draft, setDraft]           = useState(m.body);
  const [dragX, setDragX]           = useState(0);
  const [armed, setArmed]           = useState(false);
  const [leftArmed, setLeftArmed]   = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [sparkles, setSparkles]     = useState([]);

  useEffect(() => { if (isEditing) setDraft(m.body); }, [isEditing, m.body]);
  useEffect(() => () => {
    if (tapTimer.current)  clearTimeout(tapTimer.current);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (sparkleIntervalRef.current) clearInterval(sparkleIntervalRef.current);
  }, []);

  function triggerSparkles() {
    if (sparkleIntervalRef.current) clearInterval(sparkleIntervalRef.current);
    setSparkles([]);
    let count = 0;
    sparkleIntervalRef.current = setInterval(() => {
      count++;
      const now = Date.now();
      setSparkles(prev => {
        const alive = prev.filter(s => now - s.createdAt < 750);
        return [...alive, generateSparkle()];
      });
      if (count >= 10) {
        clearInterval(sparkleIntervalRef.current);
        sparkleIntervalRef.current = null;
        setTimeout(() => setSparkles([]), 800);
      }
    }, 80);
  }

  function cancelHold() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
  }

  function handleClick(e) {
    if (isEditing) return;
    if (e.target.closest('[data-bubble-action]')) return;
    if (swipeRef.current?.suppressClick) { swipeRef.current.suppressClick = false; return; }
    if (showPicker) { setShowPicker(false); return; }
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      // double-tap → sparkle burst!
      triggerSparkles();
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        const isMedia = isGifUrl(m.body) || isUploadedPhoto(m.body);
        if (mine && !isMedia) onStartEdit();
      }, DOUBLE_TAP_MS);
    }
  }

  function onPointerDown(e) {
    if (isEditing) return;
    if (e.target.closest('[data-bubble-action]')) return;
    swipeRef.current = { startX: e.clientX, startY: e.clientY, tracking: true, decided: false, suppressClick: false, pointerId: e.pointerId };
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      if (swipeRef.current && !swipeRef.current.decided) {
        swipeRef.current.suppressClick = true;
        if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
        setShowPicker(true);
        try { navigator.vibrate?.(30); } catch { /* noop */ }
      }
    }, 500);
  }
  function onPointerMove(e) {
    const s = swipeRef.current;
    if (!s?.tracking) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      cancelHold();
      if (Math.abs(dy) > Math.abs(dx)) { s.tracking = false; setDragX(0); return; }
      s.decided = true;
      try { e.currentTarget.setPointerCapture?.(s.pointerId); } catch { /* noop */ }
    }
    // Right swipe (positive dx) = reply; left swipe (negative dx, mine only) = delete
    const clamped = Math.max(mine ? -SWIPE_MAX : 0, Math.min(SWIPE_MAX, dx));
    setDragX(clamped);
    setArmed(clamped >= SWIPE_TRIGGER);
    if (mine) setLeftArmed(clamped <= -SWIPE_TRIGGER);
  }
  function onPointerUp() {
    cancelHold();
    const s = swipeRef.current;
    if (!s) return;
    if (s.decided) {
      s.suppressClick = true;
      if (armed) onSwipeReply?.(m);
      else if (leftArmed && mine) onForceDelete?.();
    }
    setDragX(0); setArmed(false); setLeftArmed(false); s.tracking = false; s.decided = false;
  }

  // Tighter inner corners on the "sender side" for consecutive messages in a cluster
  const rounding = mine
    ? ({ solo: 'rounded-2xl rounded-br-[4px]', first: 'rounded-2xl rounded-br-[4px]', middle: 'rounded-2xl rounded-r-[4px]', last: 'rounded-2xl rounded-tr-[4px]' })[clusterPos] ?? 'rounded-2xl'
    : ({ solo: 'rounded-2xl rounded-bl-[4px]', first: 'rounded-2xl rounded-bl-[4px]', middle: 'rounded-2xl rounded-l-[4px]', last: 'rounded-2xl rounded-tl-[4px]' })[clusterPos] ?? 'rounded-2xl';
  const tone = mine
    ? `${rounding} bg-[#21433b] text-white`
    : `${rounding} bg-[#4e1d37] text-white`;
  const bodyIsGif   = isGifUrl(m.body);
  const bodyIsPhoto = isUploadedPhoto(m.body);
  const bodyIsAudio = isAudioUrl(m.body);
  const bodyIsMedia = bodyIsGif || bodyIsPhoto || bodyIsAudio;
  const rxEmoji     = reactionEmoji(m.reaction);

  return (
    <div
      onClick={handleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ transform: dragX ? `translateX(${dragX}px)` : undefined, transition: dragX ? 'none' : 'transform 0.22s ease-out', touchAction: 'pan-y' }}
      className={`group relative max-w-[78%] cursor-pointer select-none ${bodyIsMedia ? 'overflow-visible rounded-2xl' : `rounded-2xl px-3 py-2 ${tone}`}`}
    >
      {/* Emoji picker — floats above bubble on long-press */}
      {showPicker && (
        <>
          {/* Transparent backdrop — covers everything including nav/composer */}
          <div
            className="fixed inset-0 z-50"
            onClick={(e) => { e.stopPropagation(); setShowPicker(false); }}
          />
          <div
            data-bubble-action
            style={{ background: theme === 'dark' ? '#1f1f1f' : '#fafafa', whiteSpace: 'nowrap' }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-0.5 rounded-full shadow-xl px-2 py-1.5"
          >
            {EMOJI_REACTIONS.map(emoji => (
              <button
                key={emoji}
                type="button"
                data-bubble-action
                onClick={(e) => { e.stopPropagation(); onSetReaction(m.reaction === emoji ? null : emoji); setShowPicker(false); }}
                className="text-xl leading-none px-1.5 py-0.5 rounded-full transition-transform hover:scale-125 active:scale-110"
                style={{ background: m.reaction === emoji ? (theme === 'dark' ? '#1f1f1f' : '#f3f4f6') : 'transparent', transform: m.reaction === emoji ? 'scale(1.2)' : undefined }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Swipe reply arrow */}
      <span
        aria-hidden="true"
        style={{ opacity: Math.min(1, dragX / SWIPE_TRIGGER), transform: `translate(-${SWIPE_TRIGGER * 0.75}px, -50%) scale(${armed ? 1.15 : 1})` }}
        className={`pointer-events-none absolute top-1/2 ${mine ? 'right-full mr-2' : 'left-0 ml-[-3px]'} flex h-7 w-7 items-center justify-center rounded-full ${armed ? 'bg-amber-500 text-white' : 'bg-white text-amber-700 shadow ring-1 ring-amber-200'}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
      </span>

      {/* Swipe-left delete indicator (mine messages only) */}
      {mine && (
        <span
          aria-hidden="true"
          style={{
            opacity: Math.min(1, Math.abs(Math.min(0, dragX)) / SWIPE_TRIGGER),
            transform: `translate(${SWIPE_TRIGGER * 0.75}px, -50%) scale(${leftArmed ? 1.15 : 1})`,
            background: leftArmed ? '#3a1818' : '#2d1212',
            color: '#fca5a5',
          }}
          className="pointer-events-none absolute top-1/2 left-full ml-2 flex h-7 w-7 items-center justify-center rounded-full shadow"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </span>
      )}

      {/* Sparkle burst — rendered above bubble content on double-tap */}
      {sparkles.map(s => (
        <SparkleInstance key={s.id} color={s.color} size={s.size} style={s.style} />
      ))}

{m.reply_to_story_id && !isEditing && <StoryReplyPreview m={m} onClick={onOpenStory} />}
      {m.reply_to_message_id && m.reply_to_body && !isEditing && <MessageReplyPreview m={m} />}

      {bodyIsMedia ? (
        /* Photo / GIF / Audio bubble */
        <div className={`relative ${bodyIsAudio ? `rounded-2xl px-0 py-0 ${tone}` : 'overflow-hidden rounded-2xl'}`}>
          {bodyIsAudio ? (
            <AudioPlayer src={m.body} mine={mine} />
          ) : (
            <img
              src={m.body}
              alt={bodyIsGif ? 'GIF' : 'Photo'}
              className="block max-w-[220px] cursor-pointer"
              loading="lazy"
              data-bubble-action
              onClick={(e) => { e.stopPropagation(); onOpenPhoto?.(m.body); }}
              onDoubleClick={(e) => { e.stopPropagation(); triggerSparkles(); }}
            />
          )}
          {/* Sparkle overlay for photos/GIFs */}
          {!bodyIsAudio && sparkles.map(s => (
            <SparkleInstance key={s.id} color={s.color} size={s.size} style={{ ...s.style, position: 'absolute', pointerEvents: 'none' }} />
          ))}
          {!bodyIsAudio && (
            <p className="absolute bottom-1 right-2 text-[10px] text-white/80 drop-shadow">{timeLabel(m.created_at)}</p>
          )}
          {mine && (
            <button
              data-bubble-action
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className={`absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full text-white group-hover:flex ${bodyIsAudio ? 'bg-amber-900/30' : 'bg-black/30'}`}
              aria-label="Delete"
            >×</button>
          )}
          {rxEmoji && (
            <span
              className={`pointer-events-none absolute -bottom-3 z-10 ${mine ? 'left-1' : 'right-1'} flex items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-sm shadow-sm ring-1 ring-black/5`}
              style={{ lineHeight: 1 }}
            >
              {rxEmoji}
            </span>
          )}
        </div>
      ) : isEditing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus rows={2}
            className="block w-full resize-none rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder-white/50 focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex justify-end gap-2 text-xs font-semibold">
            <button data-bubble-action onClick={(e) => { e.stopPropagation(); onCancelEdit(); }} className="rounded-md px-2 py-1 text-neutral-600 hover:bg-white/40">Cancel</button>
            <button data-bubble-action disabled={!draft.trim() || draft === m.body} onClick={(e) => { e.stopPropagation(); onSaveEdit(draft); }} className="rounded-md bg-white/20 px-2 py-1 text-white disabled:opacity-40">Save</button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {m.body}
            {m.extraStoryEmojis?.length > 0 && (
              <span className="ml-1">{m.extraStoryEmojis.join(' ')}</span>
            )}
          </p>
          {m.edited_at && (
            <p className="mt-0.5 text-[10px] opacity-40">edited</p>
          )}
          {mine && (
            <button
              data-bubble-action
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-white/20 text-white group-hover:flex"
              aria-label="Delete"
            >×</button>
          )}
          {rxEmoji && (
            <span
              className={`pointer-events-none absolute -bottom-3 z-10 ${mine ? 'left-1' : 'right-1'} flex items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-sm shadow-sm ring-1 ring-black/5`}
              style={{ lineHeight: 1 }}
            >
              {rxEmoji}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GIF icon button (inline SVG — no dependency)
// ---------------------------------------------------------------------------
function GifButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Send a GIF"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition hover:border-amber-300 hover:text-amber-700 active:scale-95"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2.5" />
        <path d="M11 10H8a2.5 2.5 0 0 0 0 5h3v-2.5" />
        <line x1="14.5" y1="10" x2="14.5" y2="15" />
        <path d="M17.5 10h2M17.5 12.5h1.5M17.5 15h2" />
      </svg>
    </button>
  );
}

function PhotoButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Send a photo"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition hover:border-amber-300 hover:text-amber-700 active:scale-95"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    </button>
  );
}

function NudgeButton({ onClick, disabled, name }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Send a nudge"
      className="h-10 shrink-0 rounded-full border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-500 transition hover:border-amber-300 hover:text-amber-700 active:scale-95 disabled:opacity-40"
    >
      Nudge {name}
    </button>
  );
}

function MicButton({ recording, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={recording ? 'Stop recording' : 'Record voice note'}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
        recording
          ? 'border-red-300 bg-red-50 text-red-500 animate-pulse'
          : 'border-neutral-200 bg-white text-neutral-500 hover:border-amber-300 hover:text-amber-700'
      }`}
    >
      {recording ? (
        /* Stop square */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      ) : (
        /* Microphone */
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
      )}
    </button>
  );
}

// Inline audio player for voice note bubbles — mirrors AudioNotesSection style, scaled for chat.
const WAVEFORM_BARS = Array.from({ length: 28 }, (_, i) =>
  3 + Math.round((Math.abs(Math.sin(i * 1.7)) * 0.7 + Math.abs(Math.sin(i * 0.5)) * 0.3) * 12),
);

function fmtAudio(s) {
  const v = Number.isFinite(s) && s > 0 ? s : 0;
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
}

// fallbackDur is used for MediaRecorder blobs which often report NaN/Infinity
// duration until the seek-to-end trick resolves the real value.
function AudioPlayer({ src, mine, fallbackDur = 0 }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur]         = useState(0);
  const [dur, setDur]         = useState(0);
  const [err, setErr]         = useState(false);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      document.querySelectorAll('audio').forEach(el => { if (el !== a) el.pause(); });
      setErr(false);
      a.play().catch(() => setErr(true));
    } else { a.pause(); }
  }

  // MediaRecorder blobs frequently have duration=NaN or Infinity.
  // Seeking to a huge time forces the browser to decode to the real end,
  // after which onSeeked receives the corrected finite duration.
  function handleLoadedMetadata(e) {
    const a = e.currentTarget;
    if (Number.isFinite(a.duration) && a.duration > 0) {
      setDur(a.duration);
    } else {
      // Trigger duration resolution
      a.currentTime = 1e9;
    }
  }

  function handleSeeked(e) {
    const a = e.currentTarget;
    if (Number.isFinite(a.duration) && a.duration > 0 && dur === 0) {
      setDur(a.duration);
      a.currentTime = 0; // reset to start after probing
    }
  }

  const displayDur = dur > 0 ? dur : fallbackDur;
  const progress   = displayDur > 0 ? cur / displayDur : 0;
  // Both sides: teal play button. Bar fill differs so you can tell whose is whose.
  const btnBg   = '#61dbbb';
  const barFill = mine ? '#61dbbb' : '#ed70bd';
  const barEmpty= mine ? '#3a7a6a' : '#7a3055';
  const timeCss = '#ffffff';

  function seek(e) {
    const a = audioRef.current;
    if (!a || !displayDur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * displayDur;
    setCur(a.currentTime);
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 min-w-[210px]">
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={e => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={handleSeeked}
      />
      <button
        data-bubble-action
        onClick={e => { e.stopPropagation(); toggle(); }}
        style={{ background: err ? '#ef4444' : btnBg }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          data-bubble-action
          className="flex h-7 cursor-pointer items-center gap-[2px]"
          onClick={e => { e.stopPropagation(); seek(e); }}
        >
          {WAVEFORM_BARS.map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-full"
              style={{ height: h, background: i / WAVEFORM_BARS.length <= progress ? barFill : barEmpty }}
            />
          ))}
        </div>
        <p className="mt-0.5 text-[10px] font-medium" style={{ color: timeCss }}>
          {displayDur > 0
            ? cur > 0
              ? `${fmtAudio(cur)} / ${fmtAudio(displayDur)}`
              : fmtAudio(displayDur)
            : ''}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MessagesPage() {
  const { user } = useAuth();
  const { refresh: refreshBasket } = useBasket();
  const { theme } = useTheme();
  const [data, setData] = useState({ other: null, messages: [] });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId]   = useState(null);
  const [viewerStory, setViewerStory] = useState(null);
  const [replyTo, setReplyTo]       = useState(null);
  const [gifOpen, setGifOpen]       = useState(false);
  const [recording, setRecording]   = useState(false);
  const [recPaused, setRecPaused]   = useState(false);
  const [recSecs, setRecSecs]       = useState(0);
  const [recBlob, setRecBlob]       = useState(null);
  const [recBlobUrl, setRecBlobUrl] = useState(null);
  const [showMedia, setShowMedia]   = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [raining, setRaining] = useState(null);
  const recorderRef  = useRef(null);
  const recChunksRef = useRef([]);
  const recTimerRef  = useRef(null);
  const recMimeRef   = useRef('');
  const inputRef      = useRef(null);
  const photoInputRef = useRef(null);
  const bottomRef     = useRef(null);
  const composerRef   = useRef(null);
  const lastCountRef  = useRef(0);
  const [composerHeight, setComposerHeight] = useState(80);

  async function openStoryById(storyId) {
    if (!storyId) return;
    try {
      const s = await api.getStory(storyId);
      if (s?.media_url) setViewerStory(s);
      else setError('That story is no longer available.');
    } catch (e) { setError(e.message); }
  }

  async function refresh(markRead = true) {
    try {
      const result = await api.getMessages();
      // Shake if there's an unread nudge from the other person.
      const hasUnreadNudge = result.messages.some(
        (m) => m.body === NUDGE_BODY && !m.read_at && m.sender_id !== user?.id,
      );
      if (hasUnreadNudge) triggerShake();
      // Trigger rain if the other person sent an unread rain message.
      const unreadRain = result.messages.find(
        (m) => RAIN_BODIES.has(m.body) && !m.read_at && m.sender_id !== user?.id,
      );
      if (unreadRain) setRaining((cur) => cur ?? rainConfig(RAIN_KIND_MAP[unreadRain.body]));
      setData(result);
      if (markRead && result.messages.length > 0) {
        await api.markMessagesRead();
        await refreshBasket();
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => { if (mounted) await refresh(true); })();
    const id = setInterval(() => { if (mounted) refresh(true); }, POLL_MS);
    return () => { mounted = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data.messages.length) return;
    const prevCount = lastCountRef.current;
    const isNew = data.messages.length > prevCount;
    lastCountRef.current = data.messages.length;
    if (!isNew) return;

    // Initial load (prevCount was 0) → always scroll.
    // Subsequent new messages → only scroll if user is already near the bottom,
    // so we don't yank them away while reading history.
    const isInitial = prevCount === 0;
    const isNearBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      return scrollHeight - scrollTop - clientHeight < 120;
    };

    if (isInitial || isNearBottom()) {
      // Double rAF ensures layout is fully committed before we scroll.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
      }));
    }
  }, [data.messages.length]);

  // Track composer bar height so the spacer always pushes content clear of it.
  // ResizeObserver fires whenever the tray opens/closes or reply banner appears.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setComposerHeight(el.offsetHeight);
      // Re-scroll so the last message stays above the (now taller/shorter) bar.
      requestAnimationFrame(() => {
        document.documentElement.scrollTop = 999999;
        document.body.scrollTop = 999999;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // iOS keyboard avoidance: when the visual viewport shrinks (keyboard opens),
  // lift the composer to sit flush with the top of the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const el = composerRef.current;
    if (!el) return;

    function update() {
      // How far the bottom of the visual viewport is from the bottom of the layout viewport
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      el.style.bottom = `${Math.max(0, offset)}px`;
      // Scroll to keep last message visible
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
      });
    }

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      el.style.bottom = '';
    };
  }, []);

  async function sendRain(kind) {
    if (busy || raining) return;
    setRaining(rainConfig(kind)); // sender sees it immediately
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(RAIN_BODY[kind], null, null);
      await refresh(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendNudge() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(NUDGE_BODY, null, null);
      await refresh(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function send(e) {
    if (e?.preventDefault) e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(draft, null, replyTo?.id ?? null);
      setDraft('');
      if (inputRef.current) inputRef.current.style.height = '40px';
      setReplyTo(null);
      await refresh(false);
      await refreshBasket();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Stop the ongoing recording; onstop will transition to review state.
  function stopRecording() {
    clearInterval(recTimerRef.current);
    recorderRef.current?.stop();
  }

  // Pause / resume the ongoing recording, ticking the timer accordingly.
  function togglePause() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      clearInterval(recTimerRef.current);
      setRecPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      recTimerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
      setRecPaused(false);
    }
  }

  async function toggleRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      recMimeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      recChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current);
        setRecording(false);
        setRecPaused(false);
        // Build blob + object URL for local playback review; don't send yet.
        const blob = new Blob(recChunksRef.current, { type: mimeType });
        setRecBlob(blob);
        setRecBlobUrl(URL.createObjectURL(blob));
        // showMedia stays true → review state
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecSecs(0);
      setRecording(true);
      setRecPaused(false);
      setShowMedia(true);
      recTimerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch (err) {
      setError('Microphone access denied.');
    }
  }

  async function sendVoiceNote() {
    if (!recBlob) return;
    const blob = recBlob;
    const blobUrl = recBlobUrl;
    setRecBlob(null); setRecBlobUrl(null); setRecSecs(0); setShowMedia(false);
    URL.revokeObjectURL(blobUrl);
    const mimeType = recMimeRef.current;
    const ext  = mimeType.includes('webm') ? 'webm' : 'm4a';
    const file = new File([blob], `voice-note.${ext}`, { type: mimeType });
    setBusy(true); setError(null);
    try {
      const { url } = await api.upload(file);
      await api.sendMessage(url, null, replyTo?.id ?? null);
      setReplyTo(null);
      await refresh(false);
      await refreshBasket();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function discardVoiceNote() {
    if (recBlobUrl) URL.revokeObjectURL(recBlobUrl);
    setRecBlob(null); setRecBlobUrl(null); setRecSecs(0); setShowMedia(false);
  }

  async function sendPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true); setError(null);
    try {
      const { url } = await api.upload(file);
      await api.sendMessage(url, null, replyTo?.id ?? null);
      setReplyTo(null);
      await refresh(false);
      await refreshBasket();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function sendGif(gifUrl) {
    setGifOpen(false);
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(gifUrl, null, replyTo?.id ?? null);
      setReplyTo(null);
      await refresh(false);
      await refreshBasket();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleSwipeReply(m) {
    setReplyTo({
      id: m.id,
      body: m.body,
      senderName: m.sender_id === user?.id ? 'yourself' : (data.other?.name ?? m.sender_name ?? 'them'),
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function remove(id) {
    if (!confirm('Delete this message?')) return;
    try { await api.deleteMessage(id); await refresh(false); }
    catch (e) { setError(e.message); }
  }

  async function removeForce(id) {
    setConfirmDeleteId(null);
    try { await api.deleteMessage(id); await refresh(false); }
    catch (e) { setError(e.message); }
  }

  async function saveEdit(id, body) {
    try {
      await api.editMessage(id, body);
      setEditingId(null);
      await refresh(false);
    } catch (e) { setError(e.message); }
  }

  async function setReaction(id, emoji) {
    setData((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (m.id === id ? { ...m, reaction: emoji } : m)),
    }));
    try { await api.setMessageReaction(id, emoji); }
    catch (e) { setError(e.message); await refresh(false); }
  }

  // Pre-compute cluster position for every message so the render loop can
  // tighten spacing, skip avatars, and handle rounding without re-scanning.
  const messagesWithCluster = useMemo(() => {
    const msgs = data.messages;
    return msgs.map((m, i) => {
      const isSystem = m.body === NUDGE_BODY || RAIN_BODIES.has(m.body);
      if (isSystem) return { ...m, clusterPos: 'system', storyReactionContinuation: false, extraStoryEmojis: [] };

      const prev = msgs[i - 1];

      // Detect a consecutive same-story reaction from the same sender → suppress as a continuation
      const isStoryCont = !!(
        m.reply_to_story_id
        && prev
        && prev.reply_to_story_id === m.reply_to_story_id
        && prev.sender_id === m.sender_id
        && !(prev.body === NUDGE_BODY || RAIN_BODIES.has(prev.body))
      );
      if (isStoryCont) {
        return { ...m, clusterPos: 'hidden', storyReactionContinuation: true, extraStoryEmojis: [] };
      }

      // For the head of a story-reaction chain, gather all subsequent same-story emoji bodies
      const extraStoryEmojis = [];
      if (m.reply_to_story_id) {
        let j = i + 1;
        while (
          j < msgs.length
          && msgs[j].reply_to_story_id === m.reply_to_story_id
          && msgs[j].sender_id === m.sender_id
          && !(msgs[j].body === NUDGE_BODY || RAIN_BODIES.has(msgs[j].body))
        ) {
          extraStoryEmojis.push(msgs[j].body);
          j++;
        }
      }

      // nextSame skips over continuations so they don't affect the head's cluster position
      const next = msgs.slice(i + 1).find(n =>
        !(n.reply_to_story_id && n.reply_to_story_id === m.reply_to_story_id && n.sender_id === m.sender_id)
        && !(n.body === NUDGE_BODY || RAIN_BODIES.has(n.body))
      );
      const prevSame = prev && prev.sender_id === m.sender_id && prev.body !== NUDGE_BODY && !RAIN_BODIES.has(prev.body);
      const nextSame = next && next.sender_id === m.sender_id;

      return {
        ...m,
        clusterPos: !prevSame && !nextSame ? 'solo'
                  : !prevSame && nextSame  ? 'first'
                  : prevSame  && nextSame  ? 'middle'
                  :                          'last',
        storyReactionContinuation: false,
        extraStoryEmojis,
      };
    });
  }, [data.messages]);

  let lastDay = null;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {data.other && <Avatar url={data.other.photo_url} name={data.other.name} size="lg" />}
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                {data.other ? data.other.name : 'Messages'}
              </h1>
              {data.other && (
                <p className="text-xs text-neutral-500">@{data.other.username}</p>
              )}
            </div>
          </div>
          <Link to="/account" className="shrink-0 text-sm text-neutral-500">Back</Link>
        </div>

        {!data.other && (
          <p className="text-sm text-neutral-500">No one to chat with yet.</p>
        )}

        {data.other && data.messages.length === 0 && (
          <p className="text-sm text-neutral-500">It's looking a bit bare {'—'} like your backside.</p>
        )}

        {messagesWithCluster.length > 0 && (
          <ul className="flex flex-col gap-0">
            {messagesWithCluster.map((m, msgIdx) => {
              // Story-reaction continuations are merged into the head bubble — skip rendering
              if (m.storyReactionContinuation) return null;

              const mine = m.sender_id === user?.id;
              const day = dayLabel(m.created_at);
              const showDay = day !== lastDay;
              lastDay = day;
              const isNudge = m.body === NUDGE_BODY;
              const rainKind = RAIN_KIND_MAP[m.body];
              const isRain = !!rainKind;
              const { clusterPos } = m;

              // Spacing: first/solo get top breathing room; middle/last stay tight
              const topMargin = (clusterPos === 'solo' || clusterPos === 'first') ? 'mt-3' : 'mt-0.5';
              // Extra bottom clearance when a reaction emoji floats below the bubble
              const bottomPad = m.reaction ? 'mb-4' : '';

              return (
                <li key={m.id} className={`${topMargin} ${bottomPad}`}>
                  {showDay && (
                    <p className="mb-3 mt-4 text-center text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {day}
                    </p>
                  )}
                  {isNudge ? (
                    /* ── System event pill ── */
                    <div className="my-1 flex justify-center">
                      <span
                        className="select-none rounded-full px-3 py-1 text-[11px]"
                        style={{ background: theme === 'dark' ? '#262626' : '#f0f0f0', color: theme === 'dark' ? '#6b6b6b' : '#a3a3a0' }}
                      >
                        {mine ? 'You nudged' : (data.other?.name ?? 'They') + ' nudged you'} · {timeLabel(m.created_at)}
                      </span>
                    </div>
                  ) : isRain ? (
                    <div className="my-1 flex justify-center">
                      <span
                        className="select-none rounded-full px-3 py-1 text-[11px]"
                        style={{ background: theme === 'dark' ? '#262626' : '#f0f0f0', color: theme === 'dark' ? '#6b6b6b' : '#a3a3a0' }}
                      >
                        {mine ? 'You' : (data.other?.name ?? 'They')} made it rain {rainKind}s · {timeLabel(m.created_at)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                        {/* Avatar placeholder: always reserve the width so bubbles stay aligned;
                            only render the actual avatar on the last/solo message of a cluster */}
                        {!mine && (
                          clusterPos === 'solo' || clusterPos === 'last'
                            ? <Avatar url={m.sender_photo} name={m.sender_name} />
                            : <div className="w-9 shrink-0" aria-hidden />
                        )}
                        <MessageBubble
                          m={m}
                          mine={mine}
                          clusterPos={clusterPos}
                          isEditing={editingId === m.id}
                          onOpenStory={openStoryById}
                          onStartEdit={() => setEditingId(m.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onSaveEdit={(body) => saveEdit(m.id, body)}
                          onDelete={() => remove(m.id)}
                          onForceDelete={() => setConfirmDeleteId(m.id)}
                          onSetReaction={(emoji) => setReaction(m.id, emoji)}
                          onOpenPhoto={(src) => setLightboxSrc(src)}
                          onSwipeReply={handleSwipeReply}
                        />
                      </div>
                      {/* Timestamp — shown only once per cluster, below the last/solo bubble */}
                      {(clusterPos === 'solo' || clusterPos === 'last') && (
                        <p className={`mt-0.5 text-[10px] text-neutral-400 ${mine ? 'pr-1 text-right' : 'pl-11 text-left'}`}>
                          {timeLabel(m.created_at)}
                        </p>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
      </div>
      {/* Spacer — matches live composer bar height so last message is never hidden */}
      <div style={{ height: composerHeight }} aria-hidden />
      <div ref={bottomRef} aria-hidden />

      {/* Composer bar */}
      <div ref={composerRef} className="fixed bottom-0 left-0 md:left-56 right-0 z-20 border-t border-neutral-200 bg-neutral-50/95 backdrop-blur supports-[padding:env(safe-area-inset-bottom)]:pb-[env(safe-area-inset-bottom)]">
        <div className="px-4 lg:px-8">
          {/* Media tray — slides in above the input row */}
          {showMedia && (
            <div className="pt-3 pb-1">
              {recording ? (
                /* ── State 1: actively recording ── */
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full shrink-0 transition-colors ${recPaused ? 'bg-neutral-300' : 'bg-[#61dbbb] animate-pulse'}`} />
                  <span className="w-10 text-sm font-semibold tabular-nums" style={{ color: theme === 'dark' ? '#ffffff' : '#000000' }}>
                    {`${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, '0')}`}
                  </span>
                  <span className="flex-1 text-xs text-neutral-400">{recPaused ? 'Paused' : 'Recording…'}</span>
                  {/* Pause / Resume — solid teal, no border */}
                  <button
                    type="button"
                    onClick={togglePause}
                    aria-label={recPaused ? 'Resume' : 'Pause'}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#61dbbb] text-[#0d3d2e] transition active:scale-95"
                  >
                    {recPaused ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
                    )}
                  </button>
                  {/* Stop → move to review — solid teal, no border */}
                  <button
                    type="button"
                    onClick={stopRecording}
                    aria-label="Stop recording"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#61dbbb] text-[#0d3d2e] transition active:scale-95"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                  </button>
                </div>
              ) : recBlob ? (
                /* ── State 2: review before sending ── */
                <div className="space-y-2">
                  <AudioPlayer src={recBlobUrl} mine={true} fallbackDur={recSecs} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={discardVoiceNote}
                      className="flex-1 rounded-xl border border-neutral-200 bg-white py-2 text-sm text-neutral-500 transition active:scale-95"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={sendVoiceNote}
                      disabled={busy}
                      className="flex-1 rounded-xl bg-[#61dbbb] py-2 text-sm font-semibold text-[#0d3d2e] transition active:scale-95 disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                /* ── State 3: normal media picker ── */
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <GifButton onClick={() => { setGifOpen(true); setShowMedia(false); }} />
                  <PhotoButton onClick={() => { photoInputRef.current?.click(); setShowMedia(false); }} />
                  <MicButton recording={false} onClick={toggleRecording} />
                  <NudgeButton disabled={busy} name={data.other?.name ?? 'them'} onClick={() => { setShowMedia(false); sendNudge(); }} />
                  <ModelButton disabled={!!raining} title="Rain twirls" onClick={() => { setShowMedia(false); sendRain('twirl'); }}>
                    <TwirlThumb />
                  </ModelButton>
                  <ModelButton disabled={!!raining} title="Rain popcorn" onClick={() => { setShowMedia(false); sendRain('popcorn'); }}>
                    <PopcornThumb />
                  </ModelButton>
                  <ModelButton disabled={!!raining} title="Rain ducks" onClick={() => { setShowMedia(false); sendRain('duck'); }}>
                    <DuckThumb />
                  </ModelButton>
                </div>
              )}
            </div>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={sendPhoto} />

          {replyTo && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border-l-2 border-amber-500 bg-amber-50 px-3 py-1.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  Replying to {replyTo.senderName}
                </p>
                <p className="line-clamp-1 text-neutral-700">{replyTo.body}</p>
              </div>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="shrink-0 rounded-full p-1 text-neutral-500 hover:bg-amber-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Main input row: [+] [textarea] [send] */}
          <form onSubmit={send} className="flex items-end gap-2 py-3">
            {/* + / × toggle */}
            <button
              type="button"
              onClick={() => setShowMedia(o => !o)}
              aria-label={showMedia ? 'Close media options' : 'Add media'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition hover:border-amber-300 hover:text-amber-700 active:scale-95"
            >
              {showMedia ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              )}
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={replyTo ? `Reply to ${replyTo.senderName}…` : 'Say something...'}
              autoComplete="off"
              className="block flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-sm leading-5 focus:border-amber-500 focus:outline-none resize-none overflow-hidden"
              style={{ minHeight: 40, maxHeight: 120 }}
            />

            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white disabled:opacity-40 active:scale-95 transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      <RainOverlay rain={raining} onDone={() => setRaining(null)} />

      {gifOpen && (
        <GifPicker
          onSelect={sendGif}
          onClose={() => setGifOpen(false)}
        />
      )}

      {viewerStory && (
        <StoryViewer
          stories={[viewerStory]}
          initialIndex={0}
          onClose={() => setViewerStory(null)}
        />
      )}

      {/* Swipe-delete confirmation */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl pt-7 px-4 pb-10 space-y-3"
            style={{ background: '#2a2a28' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-medium pb-1" style={{ color: '#ededea' }}>
              Are you sure you want to delete this message?
            </p>
            <button
              onClick={() => removeForce(confirmDeleteId)}
              className="w-full rounded-xl py-3 text-sm font-semibold bg-red-50 text-red-700 active:scale-95 transition"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="w-full rounded-xl py-3 text-sm font-semibold active:scale-95 transition"
              style={{ background: '#3d3d3b', color: '#9a9a95' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Photo"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            aria-label="Close"
            className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
