import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

// ─── helpers ──────────────────────────────────────────────────────────────────
const TEAL_BTN = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";
const POLL_MS  = 3000;

// ─── sub-components ───────────────────────────────────────────────────────────
function PlayerImage({ tone, players, className = '' }) {
  const player = tone === 'me' ? players.me : players.other;
  const url     = player?.photo_url;
  const initial = (player?.name ?? '?').slice(0, 1).toUpperCase();
  if (url) return <img src={url} alt="" className={`h-full w-full object-cover ${className}`} />;
  const bg = tone === 'me' ? 'bg-teal-200 text-teal-900' : 'bg-pink-200 text-pink-900';
  return <span className={`flex h-full w-full items-center justify-center font-bold ${bg} ${className}`}>{initial}</span>;
}

function PlayerChip({ tone, label, active, status, score, players }) {
  const tint = tone === 'me' ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-pink-300 bg-pink-50 text-pink-900';
  const ring = tone === 'me' ? 'ring-teal-400' : 'ring-pink-400';
  return (
    <div className={`flex flex-1 items-center gap-2.5 rounded-2xl border px-3 py-2 transition ${tint} ${active ? `ring-2 ${ring} shadow-sm` : 'opacity-70'}`}>
      <span className={`block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ${ring}`}>
        <PlayerImage tone={tone} players={players} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="text-[11px] uppercase tracking-wide opacity-70">{status || ' '}</p>
      </div>
      <span className="rounded-full bg-white/70 px-2 py-0.5 text-sm font-bold">{score}</span>
    </div>
  );
}

/** Large round photo for a won macro cell. */
function WonMacroCell({ tone, players }) {
  const ring = tone === 'me' ? 'ring-teal-400' : 'ring-pink-400';
  return (
    <div className="flex h-full w-full items-center justify-center p-1">
      <span className={`block h-full w-full overflow-hidden rounded-full ring-4 ${ring} shadow-lg animate-[zoomIn_220ms_ease-out]`}>
        <PlayerImage tone={tone} players={players} />
      </span>
    </div>
  );
}

/** Diagonal 50/50 split photo for a drawn macro cell. */
function DrawMacroCell({ players }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-full animate-[zoomIn_220ms_ease-out]">
      {/* p1 (teal) — top-left triangle */}
      <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}>
        <PlayerImage tone="me" players={players} className="absolute inset-0" />
      </div>
      {/* p2 (pink) — bottom-right triangle */}
      <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}>
        <PlayerImage tone="other" players={players} className="absolute inset-0" />
      </div>
      {/* diagonal divider line */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), white calc(50% - 1px), white calc(50% + 1px), transparent calc(50% + 1px))',
      }} />
    </div>
  );
}

/** A mini cell inside a local 3×3 board. */
function MiniCell({ value, myMark, canPlay, onClick, players }) {
  const tone = value ? (value === myMark ? 'me' : 'other') : null;
  return (
    <button
      onClick={canPlay ? onClick : undefined}
      disabled={!canPlay}
      style={{backgroundColor:'#1f1f1e'}}
      className={[
        'relative aspect-square overflow-hidden rounded-md border transition',
        'border-neutral-200',
        canPlay ? 'active:scale-90 cursor-pointer hover:brightness-125' : 'cursor-default',
      ].join(' ')}
      aria-label={tone ? `Taken by ${tone}` : canPlay ? 'Play here' : 'Empty'}
    >
      {tone && (
        <span className="absolute inset-[2px] animate-[zoomIn_160ms_ease-out] overflow-hidden rounded-full">
          <PlayerImage tone={tone} players={players} />
        </span>
      )}
      {canPlay && !tone && (
        <span className="absolute inset-0 flex items-center justify-center opacity-20">
          <span className="block h-1 w-1 rounded-full bg-neutral-400" />
        </span>
      )}
    </button>
  );
}

/** One macro cell: either resolved (photo/split) or an active mini 3×3 grid. */
function MacroCell({ index, globalCell, localBoard, isActive, isMyTurn, myMark, onMove, players }) {
  const resolved = globalCell !== null;

  let outerBorder = 'border-neutral-200';
  if (!resolved) {
    if (isActive && isMyTurn)  outerBorder = 'border-teal-400 shadow-[0_0_14px_3px_rgba(45,212,191,0.35)]';
    else if (isActive)         outerBorder = 'border-pink-400 shadow-[0_0_14px_3px_rgba(244,114,182,0.35)]';
  }

  const canPlayInBoard = !resolved && isMyTurn && isActive;

  return (
    <div className={`relative rounded-xl border-2 transition p-1 ${outerBorder}`} style={{backgroundColor:'#1f1f1e'}}>
      {resolved ? (
        <div className="flex h-full w-full items-center justify-center">
          {globalCell === 'draw'
            ? <DrawMacroCell players={players} />
            : <WonMacroCell tone={globalCell === myMark ? 'me' : 'other'} players={players} />}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5">
          {localBoard.map((cell, ci) => (
            <MiniCell
              key={ci}
              value={cell}
              myMark={myMark}
              canPlay={canPlayInBoard && !cell}
              onClick={() => onMove(index, ci)}
              players={players}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function TtfLeaderboard() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.ttfLeaderboard().then(setRows).catch(() => setRows([]));
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">Leaderboard</p>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-400">
              <th className="px-3 py-2 font-semibold">Player</th>
              <th className="px-2 py-2 text-center font-semibold">W</th>
              <th className="px-2 py-2 text-center font-semibold">D</th>
              <th className="px-2 py-2 text-center font-semibold">L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i > 0 ? 'border-t border-neutral-100' : ''}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                      {r.photo_url
                        ? <img src={r.photo_url} alt="" className="h-full w-full object-cover" />
                        : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-neutral-500">{r.name?.[0]}</span>}
                    </span>
                    <span className="font-medium text-neutral-800">{r.name}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex h-5 w-6 items-center justify-center rounded-md bg-teal-100 text-[10px] font-bold text-teal-800">{r.wins}</span>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex h-5 w-6 items-center justify-center rounded-md bg-neutral-100 text-[10px] font-bold text-neutral-600">{r.draws}</span>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="inline-flex h-5 w-6 items-center justify-center rounded-md bg-pink-100 text-[10px] font-bold text-pink-700">{r.losses}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function TicTacFacePage() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [modalDismissed, setModalDismissed] = useState(false);
  const { refresh: refreshBasket } = useBasket();

  async function load(markRead = true) {
    try {
      const data = await api.ttfState();
      setState(data);
      if (markRead) {
        await api.ttfMarkRead();
        if (refreshBasket) await refreshBasket();
      }
    } catch (e) { setError(e.message); }
  }

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = state?.match;
    if (m?.finished && m.id) {
      const acked = localStorage.getItem(`ttf_match_acked_${m.id}`);
      if (acked) setModalDismissed(true);
      else setModalDismissed(false);
    }
  }, [state?.match?.id, state?.match?.finished]);

  async function start() {
    if (busy) return;
    setBusy(true);
    try { await api.ttfStart(); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function play(boardIndex, cellIndex) {
    if (busy) return;
    setBusy(true);
    try { await api.ttfMove(state.game.id, boardIndex, cellIndex); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function resign() {
    if (busy || !state?.game || state.game.finished) return;
    if (!confirm('Resign the game? Your opponent wins.')) return;
    setBusy(true);
    try { await api.ttfResign(); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function ackMatchAndGoHome() {
    const id = state?.match?.id;
    if (id) localStorage.setItem(`ttf_match_acked_${id}`, '1');
    setModalDismissed(true);
    navigate('/');
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!state) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-neutral-500">Loading board...</div>;
  }

  const { players, game, match } = state;
  const meName    = players.me?.name    || 'You';
  const otherName = players.other?.name || 'Them';

  const myMark      = game?.you;           // 'p1' or 'p2'
  const oppMark     = myMark === 'p1' ? 'p2' : 'p1';
  const isMyTurn    = game && !game.finished && game.turn === myMark;
  const localBoards = game?.local_boards ?? Array(9).fill(null).map(() => Array(9).fill(null));
  const globalBoard = game?.global_board ?? Array(9).fill(null);
  const activeBoard = game?.active_board ?? null;  // null = any unresolved board

  // Score = local boards won in the current game
  const myBoardWins    = globalBoard.filter(c => c === myMark).length;
  const otherBoardWins = globalBoard.filter(c => c === oppMark).length;

  const winnerTone = game?.winner === 'draw' ? null
    : game?.winner ? (game.winner === myMark ? 'me' : 'other') : null;

  const showModal        = !!match?.finished && !modalDismissed;
  const matchInProgress  = match && !match.finished;
  const meStatus    = !game ? '' : game.finished ? '' : (isMyTurn ? 'Your turn' : 'Waiting');
  const otherStatus = !game ? '' : game.finished ? '' : (isMyTurn ? 'Waiting' : 'Their turn');

  return (
    <div className="space-y-4 py-2">
      {/* header */}
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-base font-semibold tracking-tight">Ultimate Tic-tac-face</h1>
        <button
          onClick={resign}
          disabled={!game || game.finished || busy}
          className="text-sm font-medium text-neutral-500 disabled:opacity-30"
        >
          {game && !game.finished ? 'Resign' : ' '}
        </button>
      </div>

      {/* Responsive: board left, controls right — lg+ proportional grid */}
      <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6 lg:items-start">

        {/* ultimate board */}
        {game && (
          <div className="relative rounded-2xl bg-gradient-to-br from-teal-400 to-pink-400 p-[3px] shadow-md">
            <div className="grid grid-cols-3 gap-2 rounded-[13px] p-2" style={{backgroundColor:'#2a2a28'}}>
              {globalBoard.map((globalCell, bi) => {
                const isBoardActive = globalCell === null && (activeBoard === null || activeBoard === bi);
                return (
                  <MacroCell
                    key={bi}
                    index={bi}
                    globalCell={globalCell}
                    localBoard={localBoards[bi] ?? Array(9).fill(null)}
                    isActive={isBoardActive}
                    isMyTurn={isMyTurn}
                    myMark={myMark}
                    onMove={play}
                    players={players}
                    game={game}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* right column: player chips + status bar */}
        <div className="space-y-4 mt-4 lg:mt-0">
          <div className="flex lg:flex-col gap-2.5">
            <PlayerChip tone="me"    label={meName}    active={isMyTurn}                              status={meStatus}    score={myBoardWins}    players={players} />
            <PlayerChip tone="other" label={otherName} active={!!game && !game.finished && !isMyTurn} status={otherStatus} score={otherBoardWins} players={players} />
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
            {!game && !match?.finished && (
              <>
                <p className="text-sm text-neutral-500">No game in progress.</p>
                <button onClick={start} disabled={busy || !players.other} className={`mt-3 ${TEAL_BTN}`}>
                  Start a game
                </button>
              </>
            )}
            {!game && match?.finished && modalDismissed && (
              <>
                <p className="text-sm text-neutral-500">Last game complete.</p>
                <button onClick={start} disabled={busy || !players.other} className={`mt-3 ${TEAL_BTN}`}>
                  New game
                </button>
              </>
            )}
            {game && !game.finished && (
              <p className="text-sm text-neutral-500">
                {isMyTurn
                  ? (<><span className="font-semibold text-teal-600">{meName}</span> to play{activeBoard !== null ? ` — board ${activeBoard + 1}` : ''}</>)
                  : (<>Waiting for <span className="font-semibold text-pink-600">{otherName}</span>...</>)}
              </p>
            )}
            {game?.finished && matchInProgress && (
              <>
                {game.winner === 'draw'   && <p className="text-base font-semibold text-neutral-700">Game drawn</p>}
                {winnerTone === 'me'      && <p className="text-base font-semibold"><span className="text-teal-600">{meName}</span> wins!</p>}
                {winnerTone === 'other'   && <p className="text-base font-semibold"><span className="text-pink-600">{otherName}</span> wins!</p>}
              </>
            )}
          </div>
          <TtfLeaderboard />
        </div>
      </div>{/* end responsive grid */}

      {/* match over modal */}
      {showModal && match && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-xl font-bold tracking-tight">Game over</h2>

            <div className="my-5 flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide text-neutral-400">{meName}</p>
                <p className="text-3xl font-bold text-teal-600">{match.me_wins}</p>
                <p className="text-xs text-neutral-400">global win</p>
              </div>
              <span className="text-xl font-bold text-neutral-300">vs</span>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide text-neutral-400">{otherName}</p>
                <p className="text-3xl font-bold text-pink-600">{match.other_wins}</p>
                <p className="text-xs text-neutral-400">global win</p>
              </div>
            </div>

            {match.winner === 'me'    && <p className="text-base font-semibold"><span className="text-teal-600">{meName}</span> wins the game!</p>}
            {match.winner === 'other' && <p className="text-base font-semibold"><span className="text-pink-600">{otherName}</span> wins the game!</p>}
            {match.winner === 'draw'  && <p className="text-base font-semibold text-neutral-700">It's a tie.</p>}

            {match.points_awarded && (
              <div className="mt-4 rounded-xl bg-neutral-100 p-3 text-left text-sm text-neutral-700">
                <p className="text-center font-semibold">Points credited</p>
                <p className="mt-2">
                  {meName}: <span className="font-bold text-teal-700">+{match.points_awarded.me}</span>
                  {match.winner === 'me' ? ` (boards won + ${match.points_awarded.bonus} bonus)` : ' (boards won)'}
                </p>
                <p>
                  {otherName}: <span className="font-bold text-pink-700">+{match.points_awarded.other}</span>
                  {match.winner === 'other' ? ` (boards won + ${match.points_awarded.bonus} bonus)` : ' (boards won)'}
                </p>
              </div>
            )}

            <button onClick={ackMatchAndGoHome} className={`mt-5 w-full ${TEAL_BTN}`}>
              Return home
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
