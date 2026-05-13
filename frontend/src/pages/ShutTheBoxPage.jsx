import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const TEAL_BTN = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";
const PALE_BTN = "rounded-xl border border-neutral-300 bg-white py-2 px-4 text-sm font-medium text-neutral-700 disabled:opacity-30";

function hasValidClose(openTiles, target) {
  const n = openTiles.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += openTiles[i];
    if (sum === target) return true;
  }
  return false;
}

function DicePip({ x, y }) { return <span className="absolute h-2 w-2 rounded-full bg-neutral-900" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }} />; }
const PIPS = {
  1: [[50,50]],
  2: [[25,25],[75,75]],
  3: [[25,25],[50,50],[75,75]],
  4: [[25,25],[25,75],[75,25],[75,75]],
  5: [[25,25],[25,75],[50,50],[75,25],[75,75]],
  6: [[25,25],[25,50],[25,75],[75,25],[75,50],[75,75]],
};
function Die({ value, rolling }) {
  return (
    <div
      className="relative h-16 w-16 rounded-2xl border border-white/40 bg-white/30 shadow-md backdrop-blur-sm"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.6), rgba(255,255,255,0.2))',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.18)',
        animation: rolling ? 'stb-roll 700ms ease-out' : 'none',
      }}
    >
      {(PIPS[value] || []).map(([x, y], i) => <DicePip key={i} x={x} y={y} />)}
    </div>
  );
}

function Tile({ value, open, selected, onTap, disabled }) {
  const base = 'relative flex h-14 w-10 items-center justify-center rounded-md font-extrabold transition-all';
  const wood = "bg-gradient-to-b from-[#8b5a2b] via-[#a06a36] to-[#6e4523] text-amber-50 shadow-md ring-1 ring-amber-900/40";
  const sunk = "bg-gradient-to-b from-[#5b4126] to-[#3f2c19] text-amber-100/40 ring-1 ring-amber-900/30 translate-y-1";
  const sel  = "ring-2 ring-pink-400 -translate-y-1";
  return (
    <button
      type="button"
      disabled={disabled || !open}
      onClick={() => onTap?.(value)}
      className={`${base} ${open ? wood : sunk} ${selected ? sel : ''} disabled:cursor-default`}
    >
      <span className="text-lg leading-none">{value}</span>
    </button>
  );
}

const ALL_TILES = [1,2,3,4,5,6,7,8,9];

export default function ShutTheBoxPage() {
  const { refresh: refreshBasket } = useBasket();
  const [quota, setQuota] = useState({ games_used_today: 0, games_limit: 5, games_remaining: 5 });
  const [game, setGame] = useState(null);
  const [openTiles, setOpenTiles] = useState([...ALL_TILES]);
  const [selected, setSelected] = useState([]);
  const [dice, setDice] = useState([null, null]);
  const [rolling, setRolling] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | rolled | over | won
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const diceSum = (dice[0] || 0) + (dice[1] || 0);
  const selectedSum = useMemo(() => selected.reduce((a,b) => a+b, 0), [selected]);
  const canConfirm = phase === 'rolled' && selectedSum === diceSum && selected.length > 0;
  const quotaExhausted = (quota.games_remaining != null) && quota.games_remaining <= 0 && phase === 'idle';

  async function loadQuota() {
    try { setQuota(await api.stbState()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { loadQuota(); }, []);

  async function newGame() {
    if (busy) return;
    setBusy(true); setError(null); setMessage('');
    try {
      const g = await api.stbStart();
      setGame(g);
      setOpenTiles([...ALL_TILES]);
      setSelected([]);
      setDice([null, null]);
      setPhase('idle');
      await loadQuota();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  function roll() {
    if (!game || phase === 'rolled' || rolling) return;
    setRolling(true);
    setMessage('');
    setTimeout(() => {
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      setDice([d1, d2]);
      setRolling(false);
      const target = d1 + d2;
      if (!hasValidClose(openTiles, target)) {
        setPhase('over');
        setMessage(`No valid combination for ${target}. Game over!`);
        // End game with loss
        api.stbEnd({ game_id: game.id, result: 'loss', final_tiles_open: openTiles }).catch(()=>{});
      } else {
        setPhase('rolled');
      }
    }, 700);
  }

  function tapTile(v) {
    if (phase !== 'rolled') return;
    setSelected((sel) => sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
  }

  async function confirmClose() {
    if (!canConfirm) return;
    const newOpen = openTiles.filter((t) => !selected.includes(t));
    setOpenTiles(newOpen);
    setSelected([]);
    setDice([null, null]);
    if (newOpen.length === 0) {
      setPhase('won');
      setMessage('You shut the box!');
      setBusy(true);
      try {
        const res = await api.stbEnd({ game_id: game.id, result: 'win', final_tiles_open: [] });
        if (refreshBasket) await refreshBasket();
        setMessage(`You shut the box! +${res.credited_pts} pts and a dice trophy.`);
      } catch (e) { setError(e.message); }
      finally { setBusy(false); }
    } else {
      setPhase('idle');
    }
  }

  async function resetGame() {
    if (!confirm('Reset this game?')) return;
    if (game && phase !== 'won') {
      try { await api.stbEnd({ game_id: game.id, result: 'abandoned', final_tiles_open: openTiles }); } catch {}
    }
    setGame(null);
    setOpenTiles([...ALL_TILES]);
    setSelected([]);
    setDice([null, null]);
    setPhase('idle');
    setMessage('');
    await loadQuota();
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <style>{`@keyframes stb-roll { 0% { transform: translateY(-20px) rotate(0deg);} 50% { transform: translateY(-4px) rotate(120deg);} 100% { transform: translateY(0) rotate(360deg);} }`}</style>
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Shut the Box</h1>
        {game ? (
          <button onClick={resetGame} disabled={busy} className="text-sm font-medium text-neutral-500 disabled:opacity-30">Reset</button>
        ) : <span className="w-10" />}
      </div>

      {/* The "wooden box" */}
      <div
        className="rounded-2xl p-4 shadow-lg"
        style={{
          background: 'linear-gradient(145deg, #a06a36, #6e4523)',
          boxShadow: '0 6px 16px rgba(82, 50, 14, 0.45), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* Felt floor */}
        <div
          className="rounded-xl p-4"
          style={{
            background: 'radial-gradient(ellipse at center, #e94f9f 0%, #c83d85 70%, #a32c6e 100%)',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.35), inset 0 -1px 2px rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex items-center justify-center gap-2">
            {ALL_TILES.map((v) => (
              <Tile
                key={v}
                value={v}
                open={openTiles.includes(v)}
                selected={selected.includes(v)}
                disabled={phase !== 'rolled'}
                onTap={tapTile}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-center gap-6 min-h-20">
            <Die value={dice[0]} rolling={rolling} />
            <Die value={dice[1]} rolling={rolling} />
          </div>
        </div>
      </div>

      {(message || phase === 'rolled') && (
        <div className="rounded-xl bg-white border border-neutral-200 p-3 text-center text-sm">
          {phase === 'rolled' && !message && (
            <>You rolled <strong>{diceSum}</strong>. Pick open tiles that sum to {diceSum}.{' '}
              <span className="text-neutral-500">Selected: {selectedSum}</span>
            </>
          )}
          {message && <span className={phase === 'won' ? 'font-semibold text-teal-700' : phase === 'over' ? 'font-semibold text-pink-600' : ''}>{message}</span>}
        </div>
      )}

      <div className="flex gap-2">
        {!game ? (
          <button onClick={newGame} disabled={busy || quotaExhausted} className={`flex-1 ${TEAL_BTN}`}>
            {busy ? '...' : 'Start game'}
          </button>
        ) : phase === 'over' || phase === 'won' ? (
          <button onClick={newGame} disabled={busy || quotaExhausted} className={`flex-1 ${TEAL_BTN}`}>
            New game
          </button>
        ) : phase === 'rolled' ? (
          <>
            <button onClick={() => setSelected([])} disabled={selected.length === 0} className={`flex-1 ${PALE_BTN}`}>Clear</button>
            <button onClick={confirmClose} disabled={!canConfirm || busy} className={`flex-1 ${TEAL_BTN}`}>
              Close tiles ({selectedSum}/{diceSum})
            </button>
          </>
        ) : (
          <button onClick={roll} disabled={rolling || busy} className={`flex-1 ${TEAL_BTN}`}>
            {rolling ? 'Rolling...' : 'Roll the dice'}
          </button>
        )}
      </div>

      {quota.games_limit != null && (
        <p className="text-center text-xs text-neutral-500">
          {quotaExhausted
            ? 'No more games today - come back tomorrow.'
            : `${quota.games_remaining} game${quota.games_remaining === 1 ? '' : 's'} left today`}
        </p>
      )}
    </div>
  );
}
