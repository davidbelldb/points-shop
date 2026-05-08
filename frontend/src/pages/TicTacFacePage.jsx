import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function evaluate(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every(Boolean)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

function PlayerImage({ player, players }) {
  const url = players?.[player]?.photo_url;
  const initial = (players?.[player]?.name ?? '?').slice(0, 1).toUpperCase();
  if (url) return <img src={url} alt="" className="h-full w-full object-cover" />;
  const bg = player === 'p1' ? 'bg-teal-200 text-teal-900' : 'bg-pink-200 text-pink-900';
  return (
    <span className={`flex h-full w-full items-center justify-center text-xl font-bold ${bg}`}>
      {initial}
    </span>
  );
}

function FaceTile({ player, glow, players }) {
  const ring = player === 'p1' ? 'ring-teal-400' : 'ring-pink-400';
  return (
    <span className={`block h-full w-full overflow-hidden rounded-full ring-4 ${ring} ${glow ? 'shadow-[0_0_22px_4px_rgba(255,255,255,0.55)]' : ''}`}>
      <PlayerImage player={player} players={players} />
    </span>
  );
}

function PlayerChip({ player, label, active, score, players }) {
  const tint = player === 'p1'
    ? 'border-teal-300 bg-teal-50 text-teal-900'
    : 'border-pink-300 bg-pink-50 text-pink-900';
  const ring = player === 'p1' ? 'ring-teal-400' : 'ring-pink-400';
  return (
    <div className={`flex flex-1 items-center gap-2.5 rounded-2xl border px-3 py-2 transition ${tint} ${active ? `ring-2 ${ring} shadow-sm` : 'opacity-70'}`}>
      <span className={`block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ${ring}`}>
        <PlayerImage player={player} players={players} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="text-[11px] uppercase tracking-wide opacity-70">
          {active ? 'Your turn' : 'Waiting'}
        </p>
      </div>
      <span className="rounded-full bg-white/70 px-2 py-0.5 text-sm font-bold">{score}</span>
    </div>
  );
}

export default function TicTacFacePage() {
  const [players, setPlayers] = useState(null);
  const [error, setError]     = useState(null);
  const [board, setBoard]     = useState(() => Array(9).fill(null));
  const [turn, setTurn]       = useState('p1');
  const [starter, setStarter] = useState('p1');
  const [scores, setScores]   = useState({ p1: 0, p2: 0, draws: 0 });

  useEffect(() => {
    api.getGamePlayers()
      .then((data) => setPlayers({
        p1: data.me ?? { name: 'Player 1' },
        p2: data.other ?? { name: 'Player 2' },
      }))
      .catch((e) => setError(e.message));
  }, []);

  const { winner, line } = useMemo(() => evaluate(board), [board]);
  const finished = !!winner;

  function play(i) {
    if (finished || board[i]) return;
    const next = board.slice();
    next[i] = turn;
    setBoard(next);
    const verdict = evaluate(next);
    if (verdict.winner && verdict.winner !== 'draw') {
      setScores((s) => ({ ...s, [verdict.winner]: s[verdict.winner] + 1 }));
    } else if (verdict.winner === 'draw') {
      setScores((s) => ({ ...s, draws: s.draws + 1 }));
    } else {
      setTurn(turn === 'p1' ? 'p2' : 'p1');
    }
  }

  function newRound() {
    const nextStarter = starter === 'p1' ? 'p2' : 'p1';
    setBoard(Array(9).fill(null));
    setTurn(nextStarter);
    setStarter(nextStarter);
  }

  function resetMatch() {
    setBoard(Array(9).fill(null));
    setTurn('p1');
    setStarter('p1');
    setScores({ p1: 0, p2: 0, draws: 0 });
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!players) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-neutral-500">
        Warming up the board...
      </div>
    );
  }

  const p1Name = players.p1?.name || players.p1?.username || 'You';
  const p2Name = players.p2?.name || players.p2?.username || 'Them';
  const winnerName = winner === 'p1' ? p1Name : winner === 'p2' ? p2Name : null;

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Tic-tac-face</h1>
        <button onClick={resetMatch} className="text-sm font-medium text-neutral-500" aria-label="Reset match">
          Reset
        </button>
      </div>

      <div className="flex gap-2.5">
        <PlayerChip player="p1" label={p1Name} active={!finished && turn === 'p1'} score={scores.p1} players={players} />
        <PlayerChip player="p2" label={p2Name} active={!finished && turn === 'p2'} score={scores.p2} players={players} />
      </div>

      <div className="relative rounded-3xl bg-gradient-to-br from-teal-500 via-teal-400 to-pink-400 p-3 shadow-lg">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/95 p-2 backdrop-blur">
          {board.map((cell, i) => {
            const isWinningCell = line?.includes(i);
            return (
              <button
                key={i}
                onClick={() => play(i)}
                disabled={!!cell || finished}
                className={`relative aspect-square overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-2 transition active:scale-95 disabled:cursor-default ${isWinningCell ? 'bg-gradient-to-br from-teal-50 to-pink-50' : ''} ${!cell && !finished ? 'hover:bg-neutral-100' : ''}`}
                aria-label={`Cell ${i + 1}${cell ? ` taken by ${cell}` : ''}`}
              >
                {cell && (
                  <span className="absolute inset-2 animate-[fadeIn_180ms_ease-out]">
                    <FaceTile player={cell} glow={isWinningCell} players={players} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-center">
        {!finished && (
          <p className="text-sm text-neutral-500">
            <span className={`font-semibold ${turn === 'p1' ? 'text-teal-600' : 'text-pink-600'}`}>
              {turn === 'p1' ? p1Name : p2Name}
            </span>
            {' '}to play
          </p>
        )}
        {winner === 'draw' && (
          <p className="text-base font-semibold text-neutral-700">It's a draw. Try again?</p>
        )}
        {winner && winner !== 'draw' && (
          <p className="text-base font-semibold">
            <span className={winner === 'p1' ? 'text-teal-600' : 'text-pink-600'}>{winnerName}</span>
            {' '}wins!
          </p>
        )}
        {finished && (
          <button
            onClick={newRound}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-teal-500 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-95"
          >
            Play again
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 text-xs text-neutral-400">
        <span>Draws</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600">{scores.draws}</span>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
