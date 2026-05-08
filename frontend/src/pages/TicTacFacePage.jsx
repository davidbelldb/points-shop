import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function findWinningLine(board) {
  for (const line of LINES) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

const TEAL_BTN  = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";

function PlayerImage({ tone, players }) {
  const player = tone === 'me' ? players.me : players.other;
  const url = player?.photo_url;
  const initial = (player?.name ?? '?').slice(0, 1).toUpperCase();
  if (url) return <img src={url} alt="" className="h-full w-full object-cover" />;
  const bg = tone === 'me' ? 'bg-teal-200 text-teal-900' : 'bg-pink-200 text-pink-900';
  return <span className={`flex h-full w-full items-center justify-center text-xl font-bold ${bg}`}>{initial}</span>;
}
function FaceTile({ tone, glow, players }) {
  const ring = tone === 'me' ? 'ring-teal-400' : 'ring-pink-400';
  return (
    <span className={`block h-full w-full overflow-hidden rounded-full ring-4 ${ring} ${glow ? 'shadow-[0_0_22px_4px_rgba(255,255,255,0.55)]' : ''}`}>
      <PlayerImage tone={tone} players={players} />
    </span>
  );
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
        <p className="text-[11px] uppercase tracking-wide opacity-70">{status || '\u00a0'}</p>
      </div>
      <span className="rounded-full bg-white/70 px-2 py-0.5 text-sm font-bold">{score}</span>
    </div>
  );
}

const POLL_MS = 3000;
const ROUND_GAP_MS = 3000;

export default function TicTacFacePage() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [modalDismissed, setModalDismissed] = useState(false);
  const { refresh: refreshBasket } = useBasket();
  const advanceTimer = useRef(null);

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

  // Acknowledge any stored ack from prior visit
  useEffect(() => {
    const m = state?.match;
    if (m?.finished && m.id) {
      const acked = localStorage.getItem(`ttf_match_acked_${m.id}`);
      if (acked) setModalDismissed(true);
      else setModalDismissed(false);
    }
  }, [state?.match?.id, state?.match?.finished]);

  // Auto-advance to next round when a round ends (but match isn't done)
  useEffect(() => {
    clearTimeout(advanceTimer.current);
    const g = state?.game;
    const m = state?.match;
    if (g?.finished && m && !m.finished) {
      advanceTimer.current = setTimeout(() => {
        if (!busy) start();
      }, ROUND_GAP_MS);
    }
    return () => clearTimeout(advanceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.game?.finished, state?.match?.finished]);

  async function start() {
    if (busy) return;
    setBusy(true);
    try { await api.ttfStart(); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function play(i) {
    if (busy) return;
    setBusy(true);
    try { await api.ttfMove(state.game.id, i); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function resign() {
    if (busy || !state?.game || state.game.finished) return;
    if (!confirm('Resign current round? Opponent gets the round.')) return;
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
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-neutral-500">Warming up the board...</div>;
  }

  const { players, game, match } = state;
  const meName    = players.me?.name    || 'You';
  const otherName = players.other?.name || 'Them';
  const board     = game?.board ?? Array(9).fill(null);
  const winLine   = game ? findWinningLine(board) : null;
  const isMyTurn  = game && !game.finished && game.turn === game.you;
  const winnerTone = game?.winner === 'draw' ? null
    : game?.winner ? (game.winner === game.you ? 'me' : 'other') : null;
  const meScore    = match?.me_wins ?? 0;
  const otherScore = match?.other_wins ?? 0;
  const showModal  = !!match?.finished && !modalDismissed;
  const meStatus    = !game ? '' : game.finished ? '' : (isMyTurn ? 'Your turn' : 'Waiting');
  const otherStatus = !game ? '' : game.finished ? '' : (isMyTurn ? 'Waiting' : 'Their turn');
  const matchInProgress = match && !match.finished;
  const currentRound = match ? Math.min(match.rounds_played + (game && !game.finished ? 1 : (game?.finished ? 0 : 1)), match.total_rounds) : null;

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Tic-tac-face</h1>
        <button
          onClick={resign}
          disabled={!game || game.finished || busy}
          className="text-sm font-medium text-neutral-500 disabled:opacity-30"
        >
          {game && !game.finished ? 'Resign' : '\u00a0'}
        </button>
      </div>

      {matchInProgress && (
        <p className="text-center text-xs font-medium uppercase tracking-wide text-neutral-400">
          Round {currentRound} of {match.total_rounds}
        </p>
      )}

      <div className="flex gap-2.5">
        <PlayerChip tone="me"    label={meName}    active={isMyTurn}                            status={meStatus}    score={meScore}    players={players} />
        <PlayerChip tone="other" label={otherName} active={!!game && !game.finished && !isMyTurn} status={otherStatus} score={otherScore} players={players} />
      </div>

      <div className="relative rounded-2xl bg-gradient-to-br from-teal-400 to-pink-400 p-[3px] shadow-md">
        <div className="grid grid-cols-3 gap-2 rounded-[13px] bg-white p-2">
          {board.map((cell, i) => {
            const isWinningCell = winLine?.includes(i);
            const tone = cell ? (cell === game?.you ? 'me' : 'other') : null;
            const canPlay = isMyTurn && !cell && !busy;
            return (
              <button
                key={i}
                onClick={() => canPlay && play(i)}
                disabled={!canPlay}
                className={`relative aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-2 transition active:scale-95 disabled:cursor-default ${isWinningCell ? 'bg-gradient-to-br from-teal-50 to-pink-50' : ''} ${canPlay ? 'hover:bg-neutral-100' : ''}`}
                aria-label={`Cell ${i + 1}${cell ? ' taken' : ''}`}
              >
                {cell && (
                  <span className="absolute inset-2 animate-[fadeIn_180ms_ease-out]">
                    <FaceTile tone={tone} glow={isWinningCell} players={players} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
        {!game && !match?.finished && (
          <>
            <p className="text-sm text-neutral-500">No match in progress.</p>
            <button onClick={start} disabled={busy || !players.other} className={`mt-3 ${TEAL_BTN}`}>
              Start a game
            </button>
          </>
        )}
        {!game && match?.finished && modalDismissed && (
          <>
            <p className="text-sm text-neutral-500">Last match complete.</p>
            <button onClick={start} disabled={busy || !players.other} className={`mt-3 ${TEAL_BTN}`}>
              Start a new match
            </button>
          </>
        )}
        {game && !game.finished && (
          <p className="text-sm text-neutral-500">
            {isMyTurn ? (<><span className="font-semibold text-teal-600">{meName}</span> to play</>)
                      : (<>Waiting for <span className="font-semibold text-pink-600">{otherName}</span>...</>)}
          </p>
        )}
        {game?.finished && matchInProgress && (
          <>
            {game.winner === 'draw' && <p className="text-base font-semibold text-neutral-700">Round drawn</p>}
            {winnerTone === 'me' && <p className="text-base font-semibold"><span className="text-teal-600">{meName}</span> won the round</p>}
            {winnerTone === 'other' && <p className="text-base font-semibold"><span className="text-pink-600">{otherName}</span> won the round</p>}
            <p className="mt-2 text-xs text-neutral-400">Next round in a moment...</p>
          </>
        )}
      </div>

      {showModal && match && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-xl font-bold tracking-tight">Match over</h2>
            <p className="mt-1 text-sm text-neutral-500">{match.total_rounds} rounds played</p>

            <div className="my-5 flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide text-neutral-400">{meName}</p>
                <p className="text-3xl font-bold text-teal-600">{match.me_wins}</p>
              </div>
              <span className="text-xl font-bold text-neutral-300">vs</span>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide text-neutral-400">{otherName}</p>
                <p className="text-3xl font-bold text-pink-600">{match.other_wins}</p>
              </div>
            </div>

            {match.winner === 'me'    && <p className="text-base font-semibold"><span className="text-teal-600">{meName}</span> wins the match!</p>}
            {match.winner === 'other' && <p className="text-base font-semibold"><span className="text-pink-600">{otherName}</span> wins the match!</p>}
            {match.winner === 'draw'  && <p className="text-base font-semibold text-neutral-700">It's a tie.</p>}

            {match.points_awarded && (
              <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-left text-sm text-neutral-700">
                <p className="text-center font-semibold">Points credited</p>
                <p className="mt-2">
                  {meName}: <span className="font-bold text-teal-700">+{match.points_awarded.me}</span>
                  {match.winner === 'me' ? ` (${match.me_wins} wins + ${match.points_awarded.bonus} bonus)` : ` (${match.me_wins} wins)`}
                </p>
                <p>
                  {otherName}: <span className="font-bold text-pink-700">+{match.points_awarded.other}</span>
                  {match.winner === 'other' ? ` (${match.other_wins} wins + ${match.points_awarded.bonus} bonus)` : ` (${match.other_wins} wins)`}
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
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
