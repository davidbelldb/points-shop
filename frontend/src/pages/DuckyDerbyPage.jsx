import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* Side-scroller camera: course is COURSE_LEN screen-widths long; camera follows the leader. */
const COURSE_LEN = 2.5;
const ANCHOR = 0.4;
const END_X = 0.68;
const SPREAD = 235;
const START_WX = 0.26;      // start line sits a little ahead of the ducks
const DUCK_W = 70;
const DUCK_H = 60;
const LANE_GAP = 15;
const GRASS_TOP = 58;       // ~30% taller — room for pole banners
const MUD_H = 12;
const WATER_TOP = GRASS_TOP + MUD_H;
const TOP_OVERLAP = 16;     // top duck pokes up over the far bank
const GRASS_BOTTOM = 22;    // near bank — sits IN FRONT of the ducks
const BOTTOM_TUCK = 12;     // last duck tucks behind the near bank
const BANNER_COLOURS = ['#e0533a', '#3a86c8', '#e0a23a', '#5aa84a', '#9b59b6', '#e07b39'];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function oddsLabel(num, den) { return `${num}/${den}`; }
function oddsMult(num, den) { return num / den + 1; }

function shade(hex, amt) {
  const h = (hex || '#4aa3c7').replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) + amt;
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  });
  return `#${ch.join('')}`;
}
function waveBg(col) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='30'><path d='M0 18 Q45 5 90 18 T180 18 V30 H0 Z' fill='${col}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function DuckSprite({ ord, duckColour, billColour, w, h }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="relative" style={{ width: w, height: h }}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: w * 0.82, height: w * 0.62, background: duckColour }}>
          <span className="absolute" style={{ right: -w * 0.13, top: '42%', width: w * 0.26, height: w * 0.16, background: billColour, borderRadius: '0 50% 50% 0' }} />
        </div>
      </div>
    );
  }
  return <img src={`/duck_${ord}.png`} alt="" style={{ width: w, height: h, objectFit: 'contain', display: 'block' }} onError={() => setBroken(true)} />;
}

/* A cartoon banner held up by two poles. */
function PoleBanner({ text, colour }) {
  return (
    <div className="relative">
      <div className="absolute" style={{ left: 4, top: 5, width: 5, height: 48, background: '#7a5230', borderRadius: 2 }} />
      <div className="absolute" style={{ right: 4, top: 5, width: 5, height: 48, background: '#7a5230', borderRadius: 2 }} />
      <div className="relative rounded-md px-3 py-1 text-center text-[11px] font-extrabold text-white shadow-md"
        style={{ background: colour, border: '2px solid rgba(255,255,255,0.6)' }}>
        {text}
      </div>
    </div>
  );
}

function duckState(elapsed, finishMs, whirlpools) {
  const list = whirlpools || [];
  const whirlTotal = list.reduce((s, w) => s + w.durationMs, 0);
  const movingMs = Math.max(1, finishMs - whirlTotal);
  let rem = elapsed;
  let lastAt = 0;
  for (const wp of list) {
    const segMs = (wp.at - lastAt) * movingMs;
    if (rem < segMs) return { m: lastAt + rem / movingMs, whirl: null };
    rem -= segMs;
    if (rem < wp.durationMs) return { m: wp.at, whirl: { frac: rem / wp.durationMs, loops: wp.loops } };
    rem -= wp.durationMs;
    lastAt = wp.at;
  }
  return { m: Math.min(1, lastAt + rem / movingMs), whirl: null };
}

export default function DuckyDerbyPage() {
  const { refresh: refreshBasket } = useBasket();
  const [phase, setPhase] = useState('loading');
  const [config, setConfig] = useState(null);
  const [lineup, setLineup] = useState(null);
  const [balance, setBalance] = useState(0);
  const [pickedOrd, setPickedOrd] = useState(null);
  const [stake, setStake] = useState('');
  const [result, setResult] = useState(null);
  const [bubbles, setBubbles] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const laneRefs = useRef({});
  const spriteRefs = useRef({});
  const bannerRefs = useRef({});
  const finishRef = useRef(null);
  const startRef = useRef(null);
  const resultTimer = useRef(null);

  async function newLineup() {
    setBusy(true); setError(null);
    try {
      const [cfg, lu] = await Promise.all([
        config ? Promise.resolve(config) : api.duckyConfig(),
        api.duckyLineup(),
      ]);
      if (!config) setConfig(cfg);
      setLineup(lu);
      setBalance(lu.balance ?? 0);
      setPickedOrd(null);
      setStake('');
      setResult(null);
      setBubbles({});
      setPhase('betting');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    newLineup();
    return () => { if (resultTimer.current) clearTimeout(resultTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ducks = (result?.ducks) || lineup?.ducks || [];
  const n = ducks.length || 1;
  const laneIndex = useMemo(() => {
    const map = {};
    ducks.forEach((d, i) => { map[d.ord] = i; });
    return map;
  }, [ducks]);
  const laneTop = (i) => WATER_TOP - TOP_OVERLAP + i * LANE_GAP;
  const lastDuckBottom = WATER_TOP - TOP_OVERLAP + (n - 1) * LANE_GAP + DUCK_H;
  const TRACK_H = lastDuckBottom - BOTTOM_TUCK + GRASS_BOTTOM;

  /* banners placed along the course (fresh positions each race) */
  const bannerLayout = useMemo(() => {
    const active = (config?.banners || []).filter((b) => b.active && b.text.trim());
    const k = active.length;
    return active.map((b, i) => ({
      ...b,
      colour: BANNER_COLOURS[i % BANNER_COLOURS.length],
      wx: 0.9 + (COURSE_LEN - 1.2) * ((i + 0.4) / Math.max(1, k)) + (Math.random() - 0.5) * 0.25,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, lineup]);

  /* ---- rAF race animation ---- */
  useEffect(() => {
    if (phase !== 'racing' || !result) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - t0;
      const states = result.ducks.map((d) => ({
        d, ...duckState(elapsed, result.finish_ms[d.ord], result.whirlpools?.[d.ord]),
      }));
      const leaderM = states.reduce((mx, s) => Math.max(mx, s.m), 0);
      const leaderWorldX = leaderM * COURSE_LEN;
      const camX = clamp(leaderWorldX - ANCHOR, 0, COURSE_LEN - END_X);
      const leaderScreen = (leaderWorldX - camX) * 100;

      for (const s of states) {
        const i = laneIndex[s.d.ord] ?? 0;
        const lane = laneRefs.current[s.d.ord];
        if (lane) {
          lane.style.left = `${leaderScreen - (leaderM - s.m) * SPREAD}%`;
          if (s.whirl) {
            const ang = s.whirl.frac * s.whirl.loops * Math.PI * 2;
            lane.style.transform = `translate(${Math.cos(ang) * 16}px, ${Math.sin(ang) * 12}px)`;
          } else {
            lane.style.transform = 'translate(0, 0)';
          }
        }
        const sprite = spriteRefs.current[s.d.ord];
        if (sprite) sprite.style.transform = `rotate(${Math.sin(elapsed / 320 + i) * 6}deg)`;
      }
      if (finishRef.current) finishRef.current.style.left = `${(COURSE_LEN - camX) * 100}%`;
      if (startRef.current) startRef.current.style.left = `${(START_WX - camX) * 100}%`;
      for (const b of bannerLayout) {
        const el = bannerRefs.current[b.ord];
        if (el) el.style.left = `${(b.wx - camX) * 100}%`;
      }

      const maxMs = Math.max(...Object.values(result.finish_ms));
      if (elapsed < maxMs + 600) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, result, laneIndex, n, bannerLayout]);

  /* ---- speech bubbles ---- */
  const activePhrases = useMemo(
    () => (config?.phrases || []).filter((p) => p.active && p.text.trim()).map((p) => p.text),
    [config],
  );
  useEffect(() => {
    if (phase !== 'racing' || !result || activePhrases.length === 0) return;
    const timers = [];
    for (const d of result.ducks) {
      const fin = result.finish_ms[d.ord];
      const count = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const at = 1800 + Math.random() * Math.max(1000, fin - 5000);
        const text = activePhrases[Math.floor(Math.random() * activePhrases.length)];
        timers.push(setTimeout(() => setBubbles((b) => ({ ...b, [d.ord]: text })), at));
        timers.push(setTimeout(() => setBubbles((b) => { const x = { ...b }; delete x[d.ord]; return x; }), at + 2600));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [phase, result, activePhrases]);

  const stakeN = parseInt(stake, 10);
  const stakeValid = Number.isInteger(stakeN) && stakeN > 0 && stakeN <= balance;
  const pickedDuck = ducks.find((d) => d.ord === pickedOrd) || null;
  const potential = pickedDuck && stakeValid
    ? Math.round(stakeN * oddsMult(pickedDuck.odds_num, pickedDuck.odds_den)) : 0;

  async function placeBet() {
    if (!pickedOrd || !stakeValid || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api.duckyRace(lineup.lineup_id, pickedOrd, stakeN);
      setResult(res);
      setBalance(res.balance);
      setPhase('racing');
      const maxMs = Math.max(...Object.values(res.finish_ms));
      resultTimer.current = setTimeout(() => {
        setPhase('result');
        if (refreshBasket) refreshBasket();
      }, maxMs + 800);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  if (phase === 'loading') {
    return <p className="py-10 text-center text-sm text-neutral-500">Saddling the ducks...</p>;
  }
  if (phase === 'error') {
    return (
      <div className="space-y-4 py-6">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  const water = config?.water_colour || '#4aa3c7';
  const noFunds = balance <= 0;
  const atBetting = phase === 'betting';

  return (
    <div className="space-y-4 py-2 pb-32">
      <style>{`@keyframes ddbob{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
        @keyframes ddwave{from{background-position-x:0}to{background-position-x:-180px}}`}</style>

      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Ducky Derby</h1>
        <span className="text-sm font-semibold text-amber-700">{balance} pts</span>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* ---- Race track (single layered container) ---- */}
      <div className="relative overflow-hidden rounded-2xl shadow-lg" style={{ height: TRACK_H, background: water }}>
        {/* far bank: grass + mud (behind the ducks) */}
        <div className="absolute inset-x-0 top-0" style={{ height: GRASS_TOP, background: '#5bbf3a', zIndex: 1 }} />
        <div className="absolute inset-x-0" style={{ top: GRASS_TOP, height: MUD_H, background: '#6b4a2a', zIndex: 1 }} />

        {/* cartoon wave layers */}
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 20, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, 26)), backgroundRepeat: 'repeat-x', opacity: 0.55, animation: 'ddwave 7s linear infinite' }} />
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 80, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, -22)), backgroundRepeat: 'repeat-x', opacity: 0.4, animation: 'ddwave 11s linear infinite' }} />
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 140, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, 40)), backgroundRepeat: 'repeat-x', opacity: 0.5, animation: 'ddwave 9s linear infinite' }} />

        {/* pole banners — placed along the course, scroll in from the right */}
        {bannerLayout.map((b) => (
          <div
            key={b.ord}
            ref={(el) => { bannerRefs.current[b.ord] = el; }}
            className="absolute"
            style={{ top: 6, left: atBetting ? `${b.wx * 100}%` : undefined, zIndex: 2 }}
          >
            <PoleBanner text={b.text} colour={b.colour} />
          </div>
        ))}

        {/* finish line (behind the ducks) */}
        <div
          ref={finishRef}
          className="absolute"
          style={{
            top: WATER_TOP - 8, left: atBetting ? `${COURSE_LEN * 100}%` : undefined,
            width: 16, height: TRACK_H - WATER_TOP + 8, zIndex: 3,
            background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #fff 0% 50%) 0 0 / 16px 16px',
          }}
        />

        {/* ducks */}
        {ducks.map((d, i) => (
          <div
            key={d.ord}
            ref={(el) => { laneRefs.current[d.ord] = el; }}
            className="absolute"
            style={{ top: laneTop(i), left: atBetting ? '0%' : undefined, zIndex: 5 + i }}
          >
            {bubbles[d.ord] && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-800 shadow">
                {bubbles[d.ord]}
                <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
              </div>
            )}
            <div ref={(el) => { spriteRefs.current[d.ord] = el; }}
              className={phase === 'racing' ? '' : 'animate-[ddbob_2.4s_ease-in-out_infinite]'}>
              <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour} w={DUCK_W} h={DUCK_H} />
            </div>
          </div>
        ))}

        {/* near bank: bottom grass — IN FRONT of the ducks */}
        <div className="absolute inset-x-0 bottom-0" style={{ height: GRASS_BOTTOM, background: '#5bbf3a', zIndex: 20 }} />

        {/* start line (dashed) — in front of the ducks */}
        <div
          ref={startRef}
          className="absolute"
          style={{ top: WATER_TOP - 8, left: atBetting ? `${START_WX * 100}%` : undefined, height: TRACK_H - WATER_TOP + 8, borderLeft: '3px dashed rgba(255,255,255,0.95)', zIndex: 30 }}
        />
      </div>

      {/* ---- Odds list (2 per row) ---- */}
      <div>
        <p className="mb-1.5 text-sm font-semibold">Pick your duck</p>
        <div className="grid grid-cols-2 gap-2">
          {ducks.map((d) => (
            <button
              key={d.ord}
              onClick={atBetting ? () => setPickedOrd(d.ord) : undefined}
              className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                pickedOrd === d.ord ? 'border-amber-500 bg-amber-50' : 'border-neutral-200 bg-white'
              } ${atBetting ? '' : 'cursor-default'}`}
            >
              <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour} w={38} h={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{d.name}</p>
                <p className="text-[11px] font-bold text-neutral-500">{oddsLabel(d.odds_num, d.odds_den)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ---- Bottom-anchored bet bar ---- */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-neutral-200 bg-white p-3 shadow-[0_-4px_14px_rgba(0,0,0,0.08)]">
        {noFunds ? (
          <p className="py-1 text-center text-sm font-medium text-amber-800">
            You need points to place a bet — win some elsewhere first!
          </p>
        ) : phase === 'betting' ? (
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[11px] text-neutral-500">Stake (max {balance})</span>
              <input
                type="number" inputMode="numeric" min={1} max={balance}
                value={stake} onChange={(e) => setStake(e.target.value)}
                className="mt-0.5 block w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm focus:border-amber-500 focus:outline-none"
                placeholder="Points"
              />
            </label>
            <button
              onClick={placeBet}
              disabled={!pickedOrd || !stakeValid || busy}
              className="shrink-0 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-500 active:scale-95 disabled:opacity-40"
            >
              {pickedDuck && stakeValid ? `Race to win ${potential}` : 'Place bet & race'}
            </button>
          </div>
        ) : (
          <button disabled className="w-full rounded-xl bg-neutral-200 py-2.5 text-sm font-semibold text-neutral-500">
            Race in progress…
          </button>
        )}
      </div>

      {/* ---- Result modal ---- */}
      {phase === 'result' && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              {result.won ? 'You won!' : 'Bad luck'}
            </p>
            <p className={`mt-2 text-center text-3xl font-extrabold ${result.won ? 'text-emerald-600' : 'text-pink-500'}`}>
              {result.won ? `+${result.payout} POINTS` : `-${result.stake} POINTS`}
            </p>
            <div className="mt-4 rounded-xl bg-neutral-100 px-4 py-3 text-center text-sm text-neutral-700">
              {(() => {
                const winner = ducks.find((d) => d.ord === result.winner_ord);
                const mine = ducks.find((d) => d.ord === result.picked_ord);
                return result.won
                  ? `${winner?.name} romped home — and that was your duck!`
                  : `${winner?.name} won it. Your duck ${mine?.name} didn't have the legs.`;
              })()}
            </div>
            <p className="mt-3 text-center text-sm text-neutral-600">
              Balance: <span className="font-semibold text-neutral-900">{balance} pts</span>
            </p>
            <button
              onClick={newLineup}
              disabled={busy}
              className="mt-5 block w-full rounded-xl bg-amber-400 py-3 text-base font-semibold text-amber-950 transition hover:bg-amber-500 active:scale-95 disabled:opacity-40"
            >
              Race again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
