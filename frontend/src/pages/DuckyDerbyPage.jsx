import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* curve name -> CSS easing for the slide animation */
const EASING = {
  'slow-fast': 'cubic-bezier(0.7, 0, 0.84, 0)',
  'fast-slow': 'cubic-bezier(0.16, 1, 0.3, 1)',
  'steady-slow': 'cubic-bezier(0.4, 0, 0.6, 1)',
  'steady-fast': 'linear',
  surge: 'cubic-bezier(0.45, 0, 0.55, 1)',
};

const START_LEFT = 3;   // %
const FINISH_LEFT = 86; // %

/* A duck sprite — uses /duck_<ord>.png, falls back to a coloured blob. */
function DuckSprite({ ord, duckColour, billColour, size = 54 }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        className="relative rounded-full"
        style={{ width: size, height: size * 0.8, background: duckColour }}
      >
        <span
          className="absolute"
          style={{
            right: -size * 0.16, top: '38%', width: size * 0.3, height: size * 0.18,
            background: billColour, borderRadius: '0 50% 50% 0',
          }}
        />
      </div>
    );
  }
  return (
    <img
      src={`/duck_${ord}.png`}
      alt=""
      style={{ width: size, height: 'auto' }}
      onError={() => setBroken(true)}
    />
  );
}

export default function DuckyDerbyPage() {
  const { refresh: refreshBasket } = useBasket();
  const [phase, setPhase] = useState('loading'); // loading|betting|racing|result|error
  const [config, setConfig] = useState(null);
  const [lineup, setLineup] = useState(null);    // { lineup_id, ducks }
  const [balance, setBalance] = useState(0);
  const [pickedOrd, setPickedOrd] = useState(null);
  const [stake, setStake] = useState('');
  const [result, setResult] = useState(null);
  const [raceStarted, setRaceStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
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
      setRaceStarted(false);
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
      // kick off the CSS transitions on the next frame
      requestAnimationFrame(() => requestAnimationFrame(() => setRaceStarted(true)));
      const winnerMs = res.finish_ms[res.winner_ord] || 7000;
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

  const ducks = lineup?.ducks || [];
  const water = config?.water_colour || '#4aa3c7';
  const noFunds = balance <= 0;

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Ducky Derby</h1>
        <span className="text-sm font-semibold text-amber-700">{balance} pts</span>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* ---- Race track ---- */}
      <div
        className="relative overflow-hidden rounded-2xl shadow-lg"
        style={{ background: water, height: Math.max(220, ducks.length * 78) }}
      >
        {/* finish line */}
        <div
          className="absolute top-0 bottom-0 border-l-2 border-dashed border-white/70"
          style={{ left: `${FINISH_LEFT + 6}%` }}
        />
        <span className="absolute right-2 top-1.5 text-[10px] font-bold uppercase tracking-wider text-white/80">
          Finish
        </span>
        {ducks.map((d, i) => {
          const racing = phase === 'racing' || phase === 'result';
          const finishMs = result?.finish_ms?.[d.ord];
          const easing = EASING[result?.curves?.[d.ord]] || 'linear';
          const left = racing && raceStarted ? `${FINISH_LEFT}%` : `${START_LEFT}%`;
          const isWinner = phase === 'result' && result?.winner_ord === d.ord;
          return (
            <div
              key={d.ord}
              className="absolute"
              style={{
                top: `${((i + 0.5) / ducks.length) * 100}%`,
                left,
                transform: 'translateY(-50%)',
                transition: racing && finishMs ? `left ${finishMs}ms ${easing}` : 'none',
              }}
            >
              <div className={isWinner ? 'animate-bounce' : 'animate-[ddbob_1.1s_ease-in-out_infinite]'}>
                <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour} />
              </div>
            </div>
          );
        })}
        <style>{`@keyframes ddbob{0%,100%{transform:rotate(-5deg) translateY(0)}50%{transform:rotate(5deg) translateY(-3px)}}`}</style>
      </div>

      {/* ---- Betting panel ---- */}
      {phase === 'betting' && (
        <>
          {noFunds ? (
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
                      <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour} size={40} />
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
          )}
        </>
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
