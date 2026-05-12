import { useState } from 'react';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const TEAL_BTN = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";

function paramsForCount(n) {
  if (n <= 4)  return { fontSize: 4.2, maxChars: 18 };
  if (n <= 6)  return { fontSize: 3.7, maxChars: 16 };
  if (n <= 8)  return { fontSize: 3.2, maxChars: 14 };
  if (n <= 10) return { fontSize: 2.8, maxChars: 12 };
  if (n <= 12) return { fontSize: 2.5, maxChars: 10 };
  return { fontSize: 2.2, maxChars: 9 };
}

function WheelSvg({ segments }) {
  if (!segments || segments.length < 2) return null;
  const size = 100;
  const cx = size / 2, cy = size / 2;
  const r = 45;
  const n = segments.length;
  const anglePer = 360 / n;
  const { fontSize, maxChars } = paramsForCount(n);
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
        // Position near outer rim with a small margin
        const labelR = r * 0.92;
        const lx = cx + labelR * Math.cos(labelAngle * Math.PI / 180);
        const ly = cy + labelR * Math.sin(labelAngle * Math.PI / 180);
        const raw = (s.label || '').toUpperCase();
        const label = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '\u2026' : raw;
        return (
          <g key={s.id}>
            <path d={d} fill={s.color || '#14b8a6'} stroke="white" strokeWidth="0.6" />
            <text
              x={lx} y={ly}
              fill="white"
              fontSize={fontSize}
              fontWeight="800"
              textAnchor="start"
              dominantBaseline="central"
              transform={`rotate(${labelAngle + 180} ${lx} ${ly})`}
              style={{
                pointerEvents: 'none',
                paintOrder: 'stroke',
                stroke: 'rgba(0,0,0,0.35)',
                strokeWidth: 0.25,
                letterSpacing: '0.15px',
              }}
            >
              {label}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={r + 1.4} fill="none" stroke="#d3f3ea" strokeWidth="1.6" />
      {Array.from({ length: n }).map((_, i) => {
        const angle = (i * anglePer - 90) * Math.PI / 180;
        const pegR = r + 1.4;
        const px = cx + pegR * Math.cos(angle);
        const py = cy + pegR * Math.sin(angle);
        return <circle key={`peg${i}`} cx={px} cy={py} r="0.95" fill="#0f172a" />;
      })}
    </svg>
  );
}

export default function WheelDisplay({ wheel, segments, maxWidth = 340 }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { refresh: refreshBasket } = useBasket();

  async function spin() {
    if (spinning || !wheel || !segments || segments.length < 2) return;
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

  const isProduct = !!(result?.segment?.award_type === 'product' && result?.segment?.product_name);
  const titleText = result
    ? (isProduct ? result.segment.product_name : (result.segment.label || '').toUpperCase())
    : '';

  return (
    <div className="flex flex-col items-center">
      <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: `${maxWidth}px` }}>
        <div className="pointer-events-none absolute left-1/2 top-0 z-[1] -translate-x-1/2 -translate-y-1">
          <svg width="26" height="30" viewBox="0 0 26 30" className="drop-shadow-md">
            <path d="M 13 30 L 0 0 L 26 0 Z" fill="#0f172a" />
          </svg>
        </div>
        <div
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
          className="absolute left-1/2 top-1/2 z-[2] flex aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-teal-300 font-extrabold tracking-wider text-teal-900 shadow-md ring-[3px] ring-white transition hover:bg-teal-400 active:scale-95 disabled:opacity-60"
          style={{ fontSize: 'clamp(0.7rem, 3.5vw, 1.1rem)' }}
          aria-label="Spin the wheel"
        >
          {spinning ? '...' : 'SPIN'}
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

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
