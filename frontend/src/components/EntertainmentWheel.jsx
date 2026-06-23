import { useEffect, useRef, useState } from 'react';
import { WheelSvg } from './WheelDisplay.jsx';
import { hapticTap, hapticParty } from '../lib/haptics.js';

/* A self-contained "what shall we watch?" wheel. Visually a clone of the
   Wheel of Misfortune (reuses WheelSvg), but the spin is purely client-side and
   awards nothing — it just lands on a title (or the "Bum Show" segment). */

const INITIAL_OFFSET = -7;
const TEAL_BTN = 'inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40';

export default function EntertainmentWheel({ segments, maxWidth = 340 }) {
  const [rotation, setRotation] = useState(INITIAL_OFFSET);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const wheelRef = useRef(null);
  const pointerRef = useRef(null);
  const prevAnimRef = useRef(null);

  function triggerFlap() {
    if (!pointerRef.current) return;
    if (prevAnimRef.current) { try { prevAnimRef.current.cancel(); } catch { /* noop */ } }
    prevAnimRef.current = pointerRef.current.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(22deg)', offset: 0.35 }, { transform: 'rotate(0deg)' }],
      { duration: 140, easing: 'ease-out' },
    );
  }

  // Tick + haptic as each peg passes the pointer during the spin.
  useEffect(() => {
    if (!spinning || !wheelRef.current) return undefined;
    const n = segments.length;
    const anglePer = 360 / n;
    let raf, lastAngle = null, totalDelta = 0, crossings = 0;
    function readAngle() {
      if (!wheelRef.current) return 0;
      const t = getComputedStyle(wheelRef.current).transform;
      if (!t || t === 'none') return 0;
      const m = t.match(/matrix\(([^)]+)\)/);
      if (!m) return 0;
      const p = m[1].split(',').map(Number);
      return Math.atan2(p[1], p[0]) * 180 / Math.PI;
    }
    function tick() {
      const cur = readAngle();
      if (lastAngle === null) { lastAngle = cur; raf = requestAnimationFrame(tick); return; }
      let delta = cur - lastAngle;
      if (delta < -180) delta += 360;
      if (delta > 180) delta -= 360;
      totalDelta += Math.abs(delta);
      lastAngle = cur;
      const newCrossings = Math.floor(totalDelta / anglePer);
      if (newCrossings > crossings) { crossings = newCrossings; triggerFlap(); hapticTap(); }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, segments.length]);

  function spin() {
    if (spinning || !segments || segments.length < 2) return;
    setSpinning(true); setResult(null);
    const n = segments.length;
    const anglePer = 360 / n;
    const idx = Math.floor(Math.random() * n);
    const jitter = (Math.random() - 0.5) * anglePer * 0.7;
    const targetMod = ((-idx * anglePer - anglePer / 2) % 360 + 360) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    const delta = ((targetMod - currentMod + 360) % 360);
    const turns = 6 + Math.floor(Math.random() * 3);
    setRotation(rotation + (turns * 360) + delta + jitter);
    setTimeout(() => {
      setResult(segments[idx]);
      setSpinning(false);
      if (!segments[idx].isBum) hapticParty();
    }, 6700);
  }

  if (!segments || segments.length < 2) return null;

  return (
    <div className="flex flex-col items-center pt-5" style={{ touchAction: 'manipulation' }}>
      <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: `${maxWidth}px` }}>
        <div className="pointer-events-none absolute left-1/2 top-[6%] z-[1] -translate-x-1/2 -translate-y-full">
          <div ref={pointerRef} style={{ transformOrigin: '50% 0%' }}>
            <img src="/wheel-pointer-x.svg" alt="" width="40" height="50" className="block select-none drop-shadow-md" draggable="false" />
          </div>
        </div>
        <div
          ref={wheelRef}
          className="h-full w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: '50% 50%',
            transition: spinning ? 'transform 6.5s cubic-bezier(0.18, 0.85, 0.25, 1)' : 'none',
            willChange: 'transform',
          }}
        >
          <WheelSvg segments={segments} />
        </div>
        <button
          onClick={spin}
          disabled={spinning}
          className="absolute left-1/2 top-1/2 z-[2] flex aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#d3f3ea] font-extrabold tracking-wider shadow-md ring-[3px] ring-white transition hover:brightness-95 active:scale-95"
          style={{ fontSize: 'clamp(0.7rem, 3.5vw, 1.1rem)', color: '#0a2a23' }}
          aria-label="Spin the wheel"
        >
          {spinning ? 'Weee!' : 'SPIN'}
        </button>
      </div>

      {result && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            {result.isBum ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Oh dear</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-700">Bum Show 💩</h2>
                <p className="mt-3 text-sm text-neutral-600">Nobody&apos;s choice tonight — give it another spin!</p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Tonight you&apos;re watching</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight" style={{ color: result.color }}>{result.label}</h2>
              </>
            )}
            <button onClick={() => setResult(null)} className={`mt-5 w-full ${TEAL_BTN}`}>
              {result.isBum ? 'Spin again' : 'Sorted!'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Build wheel segments (with the app palette + a Bum Show segment) from titles.
const PALETTE = ['#14b8a6', '#ed70bd', '#5fc4b1', '#f299d8', '#1f7a66', '#c4529a', '#7adfcf', '#f7c2e9'];
export function buildEntertainmentSegments(titles, bumShowLabel = 'Bum Show') {
  const segs = (titles ?? []).map((label, i) => ({
    id: `t${i}`, label, color: PALETTE[i % PALETTE.length], isBum: false,
  }));
  segs.push({ id: 'bum', label: bumShowLabel, color: '#525252', isBum: true });
  return segs;
}
