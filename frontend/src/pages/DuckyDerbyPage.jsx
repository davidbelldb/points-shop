import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const START = 4;    // % from left
const FINISH = 86;  // % from left

/* Duck sprite — /duck_<ord>.png, falls back to a coloured blob. */
function DuckSprite({ ord, duckColour, billColour, size = 46 }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="relative rounded-full" style={{ width: size, height: size * 0.8, background: duckColour }}>
        <span
          className="absolute"
          style={{ right: -size * 0.16, top: '38%', width: size * 0.3, height: size * 0.18, background: billColour, borderRadius: '0 50% 50% 0' }}
        />
      </div>
    );
  }
  return <img src={`/duck_${ord}.png`} alt="" style={{ width: size, height: 'auto' }} onError={() => setBroken(true)} />;
}

/* Walk a duck's whirlpool timeline -> { m: progress 0-1, spinning }. */
function duckState(elapsed, finishMs, whirlpools) {
  const list = whirlpools || [];
  const whirlTotal = list.reduce((s, w) => s + w.durationMs, 0);
  const movingMs = Math.max(1, finishMs - whirlTotal);
  let rem = elapsed;
  let lastAt = 0;
  for (const wp of list) {
    const segMs = (wp.at - lastAt) * movingMs;
    if (rem < segMs) return { m: lastAt + rem / movingMs, spinning: false };
    rem -= segMs;
    if (rem < wp.durationMs) return { m: wp.at, spinning: true };
    rem -= wp.durationMs;
    lastAt = wp.at;
  }
  return { m: Math.min(1, lastAt + rem / movingMs), spinning: false };
}

export default function DuckyDerbyPage() {
  const { refresh: refreshBasket } = useBasket();
  const [phase, setPhase] = useState('loading'); // loading|betting|racing|result|error
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

  /* ---- rAF race animation ---- */
  useEffect(() => {
    if (phase !== 'racing' || !result) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - t0;
      for (const d of result.ducks) {
        const lane = laneRefs.current[d.ord];
        const sprite = spriteRefs.current[d.ord];
        if (!lane) continue;
        const { m, spinning } = duckState(elapsed, result.finish_ms[d.ord], result.whirlpools?.[d.ord]);
        lane.style.left = `${START + m * (FINISH - START)}%`;
        if (sprite) {
          const rot = spinning ? (elapsed * 0.9) % 360 : Math.sin(elapsed / 280 + d.ord) * 9;
          sprite.style.transform = `rotate(${rot}deg)`;
        }
      }
      const maxMs = Math.max(...Object.values(result.finish_ms));
      if (elapsed < maxMs + 500) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, result]);

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
        const at = 1600 + Math.random() * Math.max(1000, fin - 4500);
        const text = activePhrases[Math.floor(Math.random() * activePhrases.length)];
        timers.push(setTimeout(() => setBubbles((b) => ({ ...b, [d.ord]: text })), at));
        timers.push(setTimeout(() => setBubbles((b) => { const n = { ...b }; delete n[d.ord]; return n; }), at + 2600));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [phase, result, activePhrases]);

  const stakeN = parseInt(stake, 10);
  const stakeValid = Number.isInteger(stakeN) && stakeN > 0 && stakeN <= balance;
  const pickedDuck = lineup?.ducks.find((d) => d.ord === pickedOrd) || null;
  const potential = pickedDuck && stakeValid ? Math.round(stakeN * pickedDuck.odds) : 0;

  async function placeBet() {
    if (!pickedOrd || !stakeValid || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api.duckyRace(lineup.lineup_id, pickedOrd, stakeN);
      setResult(res);
      setBalance(res.balance);
      setPhase('racing');
      const winnerMs = res.finish_ms[res.winner_ord] || 15000;
      resultTimer.current = setTimeout(() => {
        setPhase('result');
        if (refreshBasket) refreshBasket();
      }, winnerMs + 700);
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

  const ducks = (result?.ducks) || lineup?.ducks || [];
  const water = config?.water_colour || '#4aa3c7';
  const banners = (config?.banners || []).filter((b) => b.active && b.text.trim());
  const noFunds = balance <= 0;
  const waterH = Math.max(220, ducks.length * 42);
  const atBetting = phase === 'betting';

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Ducky Derby</h1>
        <span className="text-sm font-semibold text-amber-700">{balance} pts</span>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* ---- Race track ---- */}
      <div className="overflow-hidden rounded-2xl shadow-lg">
        {/* top grass bank with banners */}
        <div className="relative flex items-center gap-2 overflow-hidden px-3 py-2" style={{ background: '#5bbf3a', minHeight: 44 }}>
          <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: '#3f9426' }} />
          {banners.length === 0 ? (
            <span className="text-xs font-semibold text-white/70">Ducky Derby</span>
          ) : banners.map((b) => (
            <span key={b.ord} className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 shadow">
              {b.text}
            </span>
          ))}
        </div>

        {/* water */}
        <div className="relative" style={{ background: water, height: waterH }}>
          {/* start line (dashed) */}
          <div className="absolute top-0 bottom-0" style={{ left: `${START + 1}%`, borderLeft: '3px dashed rgba(255,255,255,0.85)' }} />
          {/* finish line (chequered) */}
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${FINISH + 4}%`, width: 14,
              background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #fff 0% 50%) 0 0 / 14px 14px',
            }}
          />

          {ducks.map((d, i) => (
            <div
              key={d.ord}
              ref={(el) => { laneRefs.current[d.ord] = el; }}
              className="absolute"
              style={{
                top: `${((i + 0.5) / ducks.length) * 100}%`,
                left: atBetting ? `${START}%` : undefined,
                transform: 'translateY(-50%)',
              }}
            >
              {/* speech bubble */}
              {bubbles[d.ord] && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-800 shadow">
                  {bubbles[d.ord]}
                  <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
                </div>
              )}
              <div ref={(el) => { spriteRefs.current[d.ord] = el; }}>
                <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour}
                  size={Math.min(46, (waterH / ducks.length) * 0.95)} />
              </div>
            </div>
          ))}
        </div>

        {/* bottom grass bank */}
        <div className="relative" style={{ background: '#5bbf3a', height: 22 }}>
          <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: '#3f9426' }} />
        </div>
      </div>

      {/* ---- Betting panel ---- */}
      {phase === 'betting' && (
        noFunds ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
            You need points to place a bet. Win some elsewhere, then come back to the Derby!
          </div>
        ) : (
          <>
            <div>
              <p className="mb-1 text-sm font-semibold">Pick your duck</p>
              <div className="space-y-2">
                {ducks.map((d) => (
                  <button
                    key={d.ord}
                    onClick={() => setPickedOrd(d.ord)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${
                      pickedOrd === d.ord ? 'border-amber-500 bg-amber-50' : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour} size={38} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                    <span className="shrink-0 rounded-md bg-neutral-900 px-2 py-1 text-xs font-bold text-white">
                      {d.odds.toFixed(1)}×
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
              <label className="block text-sm">
                <span className="text-xs text-neutral-500">Your stake (max {balance})</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={balance}
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  placeholder="How many points?"
                />
              </label>
              {pickedDuck && stakeValid && (
                <p className="text-xs text-neutral-600">
                  If <strong>{pickedDuck.name}</strong> wins you get back{' '}
                  <strong className="text-emerald-700">{potential} pts</strong>.
                </p>
              )}
              <button
                onClick={placeBet}
                disabled={!pickedOrd || !stakeValid || busy}
                className="w-full rounded-xl bg-amber-400 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-500 active:scale-95 disabled:opacity-40"
              >
                {busy ? '...' : 'Place bet & race!'}
              </button>
            </div>
          </>
        )
      )}

      {phase === 'racing' && (
        <p className="text-center text-sm font-medium text-neutral-500">They&apos;re off! 🦆</p>
      )}

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
