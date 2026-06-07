/**
 * Dirty Wordle
 *
 * Daily 5-letter adult word game. Same word for both players each day.
 * Points: 1=44, 2=36, 3=28, 4=16, 5=8, 6=4
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

// ─── Word list ────────────────────────────────────────────────────────────────

const WORDS = [
  // ── Your suggestions ──────────────────────────────────────────────────────
  'FILTH','SLUTS','SLAGS','WHORE','WANKY','BOOBS','TITTY','BUTTS','WILLY','BITCH',
  'STIFF','COCKS','PUSSY','CUNTS','TWATS','NECKS','PLUGS','KATIE','DAVID',
  // ── Dirty classics ────────────────────────────────────────────────────────
  'HORNY','DIRTY','SPANK','LUSTY','KINKY','NAKED','BOOTY','ERECT','LOVER','COCKY',
  'BALLS','BONER','PERVY','RANDY','JUICY','NUDES','PANTY','THONG','GROAN','MOANS',
  'LICKS','TEASE','FLIRT','STRIP','NASTY','NYMPH','TABOO','SHAFT','GRIND','STRAP',
  'TOUCH','TWERK','VULVA','DICKS','PRICK','TAINT','SPUNK','SAUCY','FLESH','FANNY',
  'MOIST','GROPE','THROB','PORNO','CRUDE','SEXTS','TRYST','DADDY','THIGH','VIXEN',
  'BAWDY','STUDS','WENCH','TRAMP','SMUTS','LETCH','KNOBS','WANKS','SHAGS','BONKS',
  'HUMPS','ROMPS','LOINS','GROIN','BUSTY','BUXOM','TARTS','HUSSY','KINKS','ARSES',
];

const WORD_LENGTH  = 5;
const MAX_GUESSES  = 6;
const PTS_BY_GUESS = [44, 36, 28, 16, 8, 4];

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatUKDate() {
  const d = new Date();
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function getDailyWord() {
  const epoch = Math.floor(Date.now() / 86_400_000);
  return WORDS[epoch % WORDS.length];
}

function evaluateGuess(guess, target) {
  const result    = Array(WORD_LENGTH).fill('absent');
  const targetArr = target.split('');
  const guessArr  = guess.split('');
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] === targetArr[i]) {
      result[i] = 'correct'; targetArr[i] = null; guessArr[i] = null;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] !== null) {
      const idx = targetArr.indexOf(guessArr[i]);
      if (idx !== -1) { result[i] = 'present'; targetArr[idx] = null; }
    }
  }
  return result;
}

// ─── Mini colour grid (shared between result modal and leaderboard) ───────────

function ColourGrid({ grid, cellSize = 32 }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {grid.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 4 }}>
          {row.map((state, ci) => (
            <div
              key={ci}
              style={{
                width: cellSize, height: cellSize,
                borderRadius: 4,
                background:
                  state === 'correct' ? '#61dbbb'
                  : state === 'present' ? '#ed70bd'
                  : '#525252',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

const TILE_BG     = { correct: '#61dbbb', present: '#ed70bd', absent: '#525252', active: 'transparent', empty: 'transparent' };
const TILE_BORDER = { correct: '#61dbbb', present: '#ed70bd', absent: '#525252', active: '#737373',     empty: '#d4d4d4' };
const TILE_TEXT   = { correct: '#0d3d2e', present: '#fff',    absent: '#fff' };

function Tile({ letter, state, delay = 0, revealed }) {
  const isColoured = ['correct','present','absent'].includes(state);
  return (
    <div
      style={{
        width: 56, height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 700,
        border: `2px solid ${TILE_BORDER[state]}`,
        borderRadius: 6,
        background: TILE_BG[state],
        color: isColoured ? TILE_TEXT[state] : 'inherit',
        transition: revealed ? `background 0.15s ${delay}ms, border-color 0.15s ${delay}ms` : 'border-color 0.1s',
        transform: letter && !revealed ? 'scale(1.08)' : 'scale(1)',
        transitionProperty: revealed ? 'background, border-color' : 'transform, border-color',
      }}
    >
      {letter}
    </div>
  );
}

// ─── Keyboard key ─────────────────────────────────────────────────────────────

const KEY_BG   = { correct: '#61dbbb', present: '#ed70bd', absent: '#525252', unused: undefined };
const KEY_TEXT = { correct: '#0d3d2e', present: '#fff',    absent: '#fff' };

function Key({ label, state, onPress }) {
  const wide = label === 'ENTER' || label === '⌫';
  const bg   = KEY_BG[state];
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPress(label); }}
      style={{
        height: 52, minWidth: wide ? 56 : 36, padding: wide ? '0 6px' : 0,
        borderRadius: 6, fontWeight: 700, fontSize: wide ? 11 : 15,
        border: 'none', background: bg, color: bg ? KEY_TEXT[state] : undefined,
        cursor: 'pointer', userSelect: 'none', touchAction: 'none', transition: 'background 0.15s',
      }}
      className={!bg ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-600 dark:text-neutral-100' : ''}
    >
      {label}
    </button>
  );
}

// ─── Button styles ────────────────────────────────────────────────────────────

const TEAL_BTN  = 'flex-1 inline-flex items-center justify-center rounded-xl bg-[#61dbbb] px-4 py-3 text-sm font-semibold text-[#0d3d2e] transition hover:opacity-90 active:scale-95';
const GHOST_BTN = 'flex-1 inline-flex items-center justify-center rounded-xl border border-neutral-400 bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-200 active:scale-95 dark:border-neutral-500 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600';

// ─── Leaderboard modal ────────────────────────────────────────────────────────

function LeaderboardModal({ onClose, today }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dirtyWordleLeaderboard(today)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [today]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-800 shadow-xl overflow-hidden">
        {/* Header — no divider, pink title */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-bold text-lg tracking-tight" style={{ color: '#ed70bd' }}>Leaderboard</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition text-lg leading-none">✕</button>
        </div>

        <div className="px-5 pb-3 space-y-6 max-h-[80vh] overflow-y-auto">
          {loading && <p className="text-sm text-center text-neutral-400">Loading...</p>}
          {!loading && !data && <p className="text-sm text-center text-neutral-400">Couldn't load leaderboard.</p>}

          {data && (
            <>
              {/* ── Today's grids ── */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-3">
                  Today — {formatUKDate()}
                </p>

                {data.today.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-2">
                    Neither of you has played today yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {data.today.map(player => (
                      <div
                        key={player.name}
                        className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3 flex flex-col items-center gap-2"
                      >
                        <p className="text-sm font-semibold text-neutral-800 dark:text-white">{player.name}</p>
                        <ColourGrid grid={player.guess_grid} cellSize={24} />
                        <div className="text-center space-y-0.5">
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {player.won
                              ? `${player.guesses_taken}/${MAX_GUESSES}`
                              : `X/${MAX_GUESSES}`}
                          </p>
                          {player.pts > 0 && (
                            <span
                              className="inline-block rounded-lg px-2 py-0.5 text-xs font-semibold"
                              style={{ background: '#61dbbb', color: '#0d3d2e' }}
                            >
                              +{player.pts} pts
                            </span>
                          )}
                          {!player.won && (
                            <p className="text-xs" style={{ color: '#ed70bd' }}>No points</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── All-time stats ── */}
              {data.allTime.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-3">All time</p>
                  <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                    {/* Header row */}
                    <div className="grid grid-cols-4 bg-neutral-100 dark:bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                      <span>Player</span>
                      <span className="text-center">Wins</span>
                      <span className="text-center">Avg</span>
                      <span className="text-center">Pts</span>
                    </div>
                    {data.allTime.map((player, i) => (
                      <div
                        key={player.name}
                        className={`grid grid-cols-4 px-3 py-2.5 text-sm items-center ${i % 2 === 0 ? 'bg-white dark:bg-neutral-800' : 'bg-neutral-50 dark:bg-neutral-850'}`}
                      >
                        <span className="font-semibold text-neutral-800 dark:text-white">{player.name}</span>
                        <span className="text-center font-bold" style={{ color: '#61dbbb' }}>{player.wins}</span>
                        <span className="text-center text-neutral-600 dark:text-neutral-300">{player.avg_guesses}</span>
                        <span className="text-center text-neutral-600 dark:text-neutral-300">{player.total_pts}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-400 text-center mt-1">Avg = average guesses on wins</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full rounded-xl bg-[#61dbbb] py-3 text-sm font-semibold text-[#0d3d2e] transition hover:opacity-90 active:scale-95">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DirtyWordlePage() {
  const { user }   = useAuth();
  const today      = getTodayDate();
  const target     = getDailyWord();
  const storageKey = `dirty-wordle-${today}`;

  const loadSaved = () => {
    try { return JSON.parse(localStorage.getItem(storageKey)) ?? {}; } catch { return {}; }
  };
  const saved = loadSaved();

  const [guesses,          setGuesses]          = useState(saved.guesses      ?? []);
  const [currentGuess,     setCurrentGuess]     = useState('');
  const [gameOver,         setGameOver]         = useState(saved.gameOver     ?? false);
  const [won,              setWon]              = useState(saved.won          ?? false);
  const [ptsEarned,        setPtsEarned]        = useState(saved.ptsEarned    ?? null);
  const [shake,            setShake]            = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [modalDismissed,   setModalDismissed]   = useState(saved.modalAcked   ?? false);
  const [resultSaved,      setResultSaved]      = useState(saved.resultSaved  ?? false);
  const [showLeaderboard,  setShowLeaderboard]  = useState(false);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      guesses, gameOver, won, ptsEarned, modalAcked: modalDismissed, resultSaved,
    }));
  }, [guesses, gameOver, won, ptsEarned, modalDismissed, resultSaved, storageKey]);

  const letterStates = useMemo(() => {
    const s = {};
    for (const guess of guesses) {
      const result = evaluateGuess(guess, target);
      guess.split('').forEach((letter, i) => {
        const next = result[i];
        const curr = s[letter];
        if (!curr || next === 'correct' || (next === 'present' && curr === 'absent')) s[letter] = next;
      });
    }
    return s;
  }, [guesses, target]);

  const submitGuess = useCallback(() => {
    if (currentGuess.length !== WORD_LENGTH) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    const newGuesses = [...guesses, currentGuess];
    const isWon      = currentGuess === target;
    const isOver     = isWon || newGuesses.length >= MAX_GUESSES;

    setGuesses(newGuesses);
    setCurrentGuess('');
    if (isWon)  setWon(true);
    if (isOver) {
      setGameOver(true);
      // Build full guess grid for the server
      const grid = newGuesses.map(g => evaluateGuess(g, target));
      const fallbackPts = isWon ? (PTS_BY_GUESS[newGuesses.length - 1] ?? 4) : 0;

      api.dirtyWordleResult({
        date: today,
        won: isWon,
        guesses_taken: newGuesses.length,
        guess_grid: grid,
      })
        .then(r => { setPtsEarned(isWon ? r.pts : 0); setResultSaved(true); })
        .catch(() => { setPtsEarned(fallbackPts); setResultSaved(false); });
    }
  }, [currentGuess, guesses, target, today]);

  const onKey = useCallback((key) => {
    if (gameOver) return;
    if (key === 'ENTER')                    { submitGuess(); return; }
    if (key === '⌫' || key === 'BACKSPACE') { setCurrentGuess(g => g.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) setCurrentGuess(g => g + key);
  }, [gameOver, submitGuess, currentGuess]);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if      (e.key === 'Enter')         onKey('ENTER');
      else if (e.key === 'Backspace')     onKey('BACKSPACE');
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey]);

  const emojiGrid = guesses.map(g =>
    evaluateGuess(g, target).map(r => r === 'correct' ? '🟩' : r === 'present' ? '🟨' : '⬛').join('')
  ).join('\n');
  const shareText = `Dirty Wordle ${today}\n${won ? guesses.length : 'X'}/${MAX_GUESSES}\n\n${emojiGrid}`;

  const copyResult = () => {
    navigator.clipboard?.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const winMessage = () => {
    if (guesses.length === 1) return 'First try. You filthy genius.';
    if (guesses.length <= 2)  return 'Two guesses. Suspiciously good.';
    if (guesses.length <= 4)  return 'Got there in the end.';
    return 'Close call — but you did it!';
  };

  const showModal  = gameOver && !modalDismissed;
  const resultGrid = guesses.map(g => evaluateGuess(g, target));

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-2">
      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <Link to="/games" className="text-sm text-neutral-500">← Games</Link>
        <h1 className="font-bold text-lg tracking-wide">Dirty Wordle</h1>
        <button
          onClick={() => setShowLeaderboard(true)}
          className="text-sm font-medium px-2 py-1 rounded-lg transition"
          style={{ color: '#61dbbb' }}
        >
          Board
        </button>
      </div>

      <p className="text-xs text-neutral-400">{formatUKDate()} — New dirty word at midnight</p>

      {/* Grid */}
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: MAX_GUESSES }, (_, rowIdx) => {
          const submitted = rowIdx < guesses.length;
          const isCurrent = rowIdx === guesses.length && !gameOver;
          const word      = submitted ? guesses[rowIdx] : isCurrent ? currentGuess : '';
          const result    = submitted ? evaluateGuess(word, target) : null;
          return (
            <div
              key={rowIdx}
              style={{ display: 'flex', gap: 6, animation: isCurrent && shake ? 'wordle-shake 0.5s ease-in-out' : 'none' }}
            >
              {Array.from({ length: WORD_LENGTH }, (_, colIdx) => {
                const letter = word[colIdx] ?? '';
                const state  = result ? result[colIdx] : letter ? 'active' : 'empty';
                return <Tile key={colIdx} letter={letter} state={state} delay={colIdx * 80} revealed={submitted} />;
              })}
            </div>
          );
        })}
      </div>

      {/* On-screen keyboard */}
      <div className="flex flex-col gap-1.5 mt-1">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
            {row.map(key => (
              <Key key={key} label={key} state={letterStates[key] ?? 'unused'} onPress={onKey} />
            ))}
          </div>
        ))}
      </div>

      {/* Result modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-neutral-800 p-6 text-center shadow-xl space-y-4">
            {won ? (
              <>
                <h2 className="text-xl font-bold tracking-tight" style={{ color: '#61dbbb' }}>
                  Good work, {user?.name ?? 'you'}!
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{winMessage()}</p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold tracking-tight text-neutral-800 dark:text-white">
                  Sad times, {user?.name ?? 'you'}
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  The word was <span className="font-bold" style={{ color: '#ed70bd' }}>{target}</span>
                </p>
              </>
            )}

            <ColourGrid grid={resultGrid} cellSize={32} />

            <p className="text-xs text-neutral-400">
              {won ? guesses.length : 'X'}/{MAX_GUESSES}
              {ptsEarned != null && ptsEarned > 0 && (
                <span className="ml-2 rounded-lg px-2 py-0.5 text-xs font-semibold" style={{ background: '#61dbbb', color: '#0d3d2e' }}>
                  +{ptsEarned} pts
                </span>
              )}
            </p>

            <div className="flex flex-row gap-2">
              <button onClick={() => setModalDismissed(true)} className={GHOST_BTN}>Close</button>
              <button onClick={copyResult} className={TEAL_BTN}>{copied ? 'Copied!' : 'Copy result'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard modal */}
      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} today={today} />
      )}

      <style>{`
        @keyframes wordle-shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-5px); }
          80%      { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
