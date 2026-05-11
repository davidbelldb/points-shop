import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const TEAL_BTN = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";

function WheelSvg({ segments }) {
  if (!segments || segments.length < 2) return null;
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1.5;
  const n = segments.length;
  const anglePer = 360 / n;
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
        const labelR = r * 0.6;
        const lx = cx + labelR * Math.cos(labelAngle * Math.PI / 180);
        const ly = cy + labelR * Math.sin(labelAngle * Math.PI / 180);
        const raw = s.label || '';
        const label = raw.length > 16 ? raw.slice(0, 15) + '\u2026' : raw;
        const len = Math.max(label.length, 4);
        const fontSize = Math.max(2.6, Math.min(4.6, 56 / (len * 1.25)));
        return (
          <g key={s.id}>
            <path d={d} fill={s.color || '#14b8a6'} stroke="white" strokeWidth="0.6" />
            <text
              x={lx} y={ly}
              fill="white"
              fontSize={fontSize}
              fontWeight="800"
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(${labelAngle + 180} ${lx} ${ly})`}
              style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 0.3 }}
            >
              {label}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.13} fill="white" stroke="#0f766e" strokeWidth="1" />
    </svg>
  );
}

export default function WheelOfMisfortunePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const { refresh: refreshBasket } = useBasket();

  async function load() {
    try { setData(await api.getActiveWheel()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function spin() {
    if (spinning || !data?.wheel || !data?.segments || data.segments.length < 2) return;
    setSpinning(true); setResult(null);
    try {
      const res = await api.spinWheel(data.wheel.id);
      const n = data.segments.length;
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

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!data) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-neutral-500">Loading...</div>;
  const segments = data.segments || [];
  const canSpin = segments.length >= 2;

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Wheel of Misfortune</h1>
        <span className="w-10" />
      </div>

      {!canSpin ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <p className="text-sm text-neutral-500">Wheel not configured yet.</p>
          <p className="mt-1 text-xs text-neutral-400">Add at least 2 segments from the admin page.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-5">
          <div className="relative mx-auto aspect-square w-full max-w-[340px]">
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
          </div>
          <button onClick={spin} disabled={spinning || !canSpin} className={`px-8 py-3 text-base font-bold ${TEAL_BTN}`}>
            {spinning ? 'Spinning...' : 'Spin the wheel'}
          </button>
          <p className="text-xs text-neutral-400">May fortune favour you. Or not.</p>
        </div>
      )}

      {result && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">You landed on</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight" style={{ color: result.segment.color }}>
              {result.segment.label}
            </h2>
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
