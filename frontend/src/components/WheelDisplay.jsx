import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const TEAL_BTN = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";
const INITIAL_OFFSET = -7; // small rest rotation so the pointer sits between two pegs

function paramsForCount(n) {
  if (n <= 4)  return { fontSize: 4.5 };
  if (n <= 6)  return { fontSize: 3.8 };
  if (n <= 8)  return { fontSize: 3.4 };
  if (n <= 10) return { fontSize: 3.1 };
  if (n <= 12) return { fontSize: 2.8 };
  if (n <= 16) return { fontSize: 2.6 };
  return { fontSize: 2.4 };
}

function WheelSvg({ segments, pegColor, textColor, textOpacity }) {
  if (!segments || segments.length < 2) return null;
  const size = 100;
  const cx = size / 2, cy = size / 2;
  const r = 45;
  const n = segments.length;
  const anglePer = 360 / n;
  const { fontSize } = paramsForCount(n);
  const labelR = r * 0.92;
  const maxRadialWidth = labelR - 13 - 1.5;
  const pegFill  = pegColor  || '#0f172a';
  const textFill = textColor || '#ffffff';
  const textFillOpacity = (textOpacity == null) ? 1 : Math.max(0, Math.min(1, textOpacity / 100));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="block h-full w-full">
      {segments.map((s, i) => {
        const startAngle = i * anglePer - 90;
        const endAngle   = (i + 1) * anglePer - 90;
        const sRad = startAngle * Math.PI / 180;
        const eRad = endAngle   * Math.PI / 180;
        const x1 = cx + r * Math.cos(sRad), y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad), y2 = cy + r * Math.sin(eRad);
        const largeArc = anglePer > 180 ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        const labelAngle = (startAngle + endAngle) / 2;
        const lx = cx + labelR * Math.cos(labelAngle * Math.PI / 180);
        const ly = cy + labelR * Math.sin(labelAngle * Math.PI / 180);
        const raw = (s.label || '').toUpperCase().trim();
        const label = raw.length > 32 ? raw.slice(0, 31) + '\u2026' : raw;
        const naturalWidth = label.length * fontSize * 0.58;
        const useScale = naturalWidth > maxRadialWidth;
        return (
          <g key={s.id}>
            <path d={d} fill={s.color || '#14b8a6'} stroke="white" strokeWidth="0.6" />
            <text
              x={lx} y={ly}
              fill={textFill}
              fillOpacity={textFillOpacity}
              fontSize={fontSize}
              fontWeight="800"
              textAnchor="start"
              dominantBaseline="central"
              transform={`rotate(${labelAngle + 180} ${lx} ${ly})`}
              {...(useScale ? { textLength: maxRadialWidth, lengthAdjust: 'spacingAndGlyphs' } : {})}
              style={{
                pointerEvents: 'none',
                paintOrder: 'stroke',
                stroke: 'rgba(0,0,0,0.35)',
                strokeWidth: 0.25,
              }}
            >
              {label}
            </text>
          </g>
        );
      })}
      {/* Teal outer ring */}
      <circle cx={cx} cy={cy} r={r + 1.4} fill="none" stroke="#d3f3ea" strokeWidth="1.6" />
      {/* Pegs straddle the rim - larger + configurable colour */}
      {Array.from({ length: n }).map((_, i) => {
        const angle = (i * anglePer - 90) * Math.PI / 180;
        const pegR = r;
        const px = cx + pegR * Math.cos(angle);
        const py = cy + pegR * Math.sin(angle);
        return <circle key={`peg${i}`} cx={px} cy={py} r="1.6" fill={pegFill} />;
      })}
    </svg>
  );
}

export default function WheelDisplay({ wheel, segments, maxWidth = 340 }) {
  const [rotation, setRotation] = useState(INITIAL_OFFSET);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const wheelRef = useRef(null);
  const pointerRef = useRef(null);
  const prevAnimRef = useRef(null);
  const { refresh: refreshBasket } = useBasket();
  const spinsRemaining = wheel?.spins_remaining;
  const quotaExhausted = typeof spinsRemaining === 'number' && spinsRemaining <= 0;

  function triggerFlap() {
    if (!pointerRef.current) return;
    if (prevAnimRef.current) {
      try { prevAnimRef.current.cancel(); } catch {}
    }
    prevAnimRef.current = pointerRef.current.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(22deg)', offset: 0.35 },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 140, easing: 'ease-out' },
    );
  }

  useEffect(() => {
    if (!spinning || !wheelRef.current) return;
    const n = segments.length;
    const anglePer = 360 / n;
    let raf;
    let lastAngle = null;
    let totalDelta = 0;
    let crossings = 0;
    function readAngle() {
      if (!wheelRef.current) return 0;
      const t = getComputedStyle(wheelRef.current).transform;
      if (!t || t === 'none') return 0;
      const m = t.match(/matrix\(([^)]+)\)/);
      if (!m) return 0;
      const parts = m[1].split(',').map(Number);
      return Math.atan2(parts[1], parts[0]) * 180 / Math.PI;
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
      if (newCrossings > crossings) {
        crossings = newCrossings;
        triggerFlap();
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, segments.length]);

  async function spin() {
    if (spinning || !wheel || !segments || segments.length < 2 || quotaExhausted) return;
    setSpinning(true); setResult(null);
    try {
      const res = await api.spinWheel(wheel.id);
      const n = segments.length;
      const anglePer = 360 / n;
      const idx = res.segment_index;
      const jitter = (Math.random() - 0.5) * anglePer * 0.7;
      const targetMod = ((-idx * anglePer - anglePer / 2) % 360 + 360) % 360;
      const currentMod = ((rotation % 360) + 360) % 360;
      const delta = ((targetMod - currentMod + 360) % 360);
      const turns = 6 + Math.floor(Math.random() * 3);
      const newRotation = rotation + (turns * 360) + delta + jitter;
      setRotation(newRotation);
      setTimeout(() => {
        setResult(res);
        setSpinning(false);
        if (refreshBasket) refreshBasket();
      }, 6700);
    } catch (e) {
      setError(e.message);
      setSpinning(false);
    }
  }

  if (!wheel || !segments || segments.length < 2) return null;

  const spinLabel = (wheel.spin_label || 'SPIN').toUpperCase();
  const isProduct = !!(result?.segment?.award_type === 'product' && result?.segment?.product_name);
  const titleText = result
    ? (isProduct ? result.segment.product_name : (result.segment.label || '').toUpperCase())
    : '';

  return (
    <div className="flex flex-col items-center pt-4" style={{ touchAction: 'manipulation' }}>
      <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: `${maxWidth}px` }}>
        <div className="pointer-events-none absolute left-1/2 top-[6%] z-[1] -translate-x-1/2 -translate-y-full">
          <div ref={pointerRef} style={{ transformOrigin: '50% 0%' }}>
            <img
              src="/wheel-pointer.svg"
              alt=""
              width="20" height="25"
              className="block select-none drop-shadow-md"
              draggable="false"
            />
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
          <WheelSvg segments={segments} pegColor={wheel.peg_color} textColor={wheel.text_color} textOpacity={wheel.text_opacity} />
        </div>
        <button
          onClick={spin}
          disabled={spinning || quotaExhausted}
          className="absolute left-1/2 top-1/2 z-[2] flex aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#d3f3ea] font-extrabold tracking-wider text-teal-900 shadow-md ring-[3px] ring-white transition hover:brightness-95 active:scale-95"
          style={{ fontSize: 'clamp(0.7rem, 3.5vw, 1.1rem)' }}
          aria-label="Spin the wheel"
        >
          {spinning ? 'Weee!' : (quotaExhausted ? 'WAIT' : spinLabel)}
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
      {!error && quotaExhausted && (
        <p className="mt-3 text-center text-sm font-semibold text-pink-600">No more spins today - come back tomorrow.</p>
      )}
      {!error && !quotaExhausted && typeof spinsRemaining === 'number' && spinsRemaining < 4 && (
        <p className="mt-3 text-center text-xs text-neutral-500">{spinsRemaining} spin{spinsRemaining === 1 ? '' : 's'} left today</p>
      )}

      {result && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">You landed on</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight" style={{ color: result.segment.color }}>
              {titleText}
            </h2>
            {isProduct && result.segment.product_thumbnail && (
              <img src={result.segment.product_thumbnail} alt="" className="mx-auto mt-3 h-20 w-20 rounded-lg object-cover" />
            )}
            <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">
              {result.award_summary}
            </div>
            <p className="mt-3 text-xs text-neutral-500">Your balance: <strong>{result.new_balance} pts</strong></p>
            <button onClick={() => setResult(null)} className={`mt-5 w-full ${TEAL_BTN}`}>Continue</button>
          </div>
        </div>
      )}
    </div>
  );
}
