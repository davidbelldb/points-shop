/**
 * Dirty Wordle
 *
 * Daily 5-letter adult word game. Same word for both players each day,
 * resets at midnight UTC. Points awarded on win, scaled by guesses taken.
 *
 * Points: 1 guess=12, 2=10, 3=8, 4=6, 5=4, 6=2
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

// ─── Word list ────────────────────────────────────────────────────────────────

const WORDS = [
  'HORNY','DIRTY','SPANK','LUSTY','KINKY','NAKED','BOOBS','BOOTY','ERECT','LOVER',
  'COCKY','BALLS','BONER','PERVY','FILTH','RANDY','JUICY','NUDES','PANTY','THONG',
  'GROAN','MOANS','LICKS','TEASE','FLIRT','STRIP','NASTY','NYMPH','TABOO','WILLY',
  'WOODY','SHAFT','GRIND','STRAP','TOUCH','TWERK','VULVA','DICKS','PRICK','PUSSY',
  'BUTTS','TAINT','BOOBY','SWEAT','SEMEN','SPUNK','SAUCY','FLESH','FANNY','MOIST',
  'GROPE','STIFF','THROB','PORNO','CRUDE','SEXTS','TRYST','DADDY','THIGH','VIXEN',
  'FREAK','BAWDY','SASSY','STUDS','TEMPT','WENCH','SMUTS','OGLED','LEERS','TRAMP',
  'LETCH','TORSO','SLUTT','CHAFE','HEAVE','THROB','LUSHY','ROGUE','PLUMP','GRUBS',
];

const WORD_LENGTH  = 5;
const MAX_GUESSES  = 6;
const PTS_BY_GUESS = [12, 10, 8, 6, 4, 2];

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayDate() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
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
      result[i]    = 'correct';
      targetArr[i] = null;
      guessArr[i]  = null;
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

// ─── Tile ─────────────────────────────────────────────────────────────────────

const TILE_BG = {
  correct: '#61dbbb',
  present: '#ed70bd',
  absent:  '#525252',
  active:  'transparent',
  empty:   'transparent',
};
const TILE_BORDER = {
  correct: '#61dbbb',
  present: '#ed70bd',
  absent:  '#525252',
  active:  '#737373',
  empty:   '#d4d4d4',
};
const TILE_TEXT = {
  correct: '#0d3d2e',
  present: '#fff',
  absent:  '#fff',
};

function Tile({ letter, state, delay = 0, revealed }) {
  const isColoured = ['correct','present','absent'].includes(state);
  return (
    <div
      style={{
        width: 56, height: 56,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:        22,
        fontWeight:      700,
        border:          `2px solid ${TILE_BORDER[state]}`,
        borderRadius:    6,
        background:      TILE_BG[state],
        color:           isColoured ? TILE_TEXT[state] : 'inherit',
        transition:      revealed ? `background 0.15s ${delay}ms, border-color 0.15s ${delay}ms` : 'border-color 0.1s',
        transform:       letter && !revealed ? 'scale(1.08)' : 'scale(1)',
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
  const col  = KEY_TEXT[state];

  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPress(label); }}
      style={{
        height:       52,
        minWidth:     wide ? 56 : 36,
        padding:      wide ? '0 6px' : 0,
        borderRadius: 6,
        fontWeight:   700,
        fontSize:     wide ? 11 : 15,
        border:       'none',
        background:   bg,
        color:        bg ? col : undefined,
        cursor:       'pointer',
        userSelect:   'none',
        touchAction:  'none',
        transition:   'background 0.15s',
      }}
      className={!bg ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-600 dark:text-neutral-100' : ''}
    >
      {label}
    </button>
  );
}

// ─── Button styles ────────────────────────────────────────────────────────────

const TEAL_BTN  = 'inline-flex items-center justify-center rounded-xl bg-[#61dbbb] px-5 py-2 text-sm font-semibold text-[#0d3d2e] transition hover:opacity-90 active:scale-95';
const GHOST_BTN = 'inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-95 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200';

// ─── Main component ───────────────────────────────────────────────────────────

export default function DirtyWordlePage() {
  const today      = getTodayDate();
  const target     = getDailyWord();
  const storageKey = `dirty-wordle-${today}`;

  const loadSaved = () => {
    try { return JSON.parse(localStorage.getItem(storageKey)) ?? {}; } catch { return {}; }
  };
  const saved = loadSaved();

  const [guesses,        setGuesses]        = useState(saved.guesses      ?? []);
  const [currentGuess,   setCurrentGuess]   = useState('');
  const [gameOver,       setGameOver]       = useState(saved.gameOver     ?? false);
  const [won,            setWon]            = useState(saved.won          ?? false);
  const [ptsEarned,      setPtsEarned]      = useState(saved.ptsEarned    ?? null);
  const [shake,          setShake]          = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [modalDismissed, setModalDismissed] = useState(saved.modalAcked   ?? false);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      guesses, gameOver, won, ptsEarned, modalAcked: modalDismissed,
    }));
  }, [guesses, gameOver, won, ptsEarned, modalDismissed, storageKey]);

  const letterStates = useMemo(() => {
    const s = {};
    for (const guess of guesses) {
      const result = evaluateGuess(guess, target);
      guess.split('').forEach((letter, i) => {
        const next = result[i];
        const curr = s[letter];
        if (!curr || next === 'correct' || (next === 'present' && curr === 'absent')) {
          s[letter] = next;
        }
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
    if (isOver) setGameOver(true);

    if (isWon) {
      const fallbackPts = PTS_BY_GUESS[newGuesses.length - 1] ?? 2;
      api.dirtyWordleWin(newGuesses.length, today)
        .then(r => setPtsEarned(r.pts))
        .catch(() => setPtsEarned(fallbackPts));
    }
  }, [currentGuess, guesses, target, today]);

  const onKey = useCallback((key) => {
    if (gameOver) return;
    if (key === 'ENTER')                    { submitGuess(); return; }
    if (key === '⌫' || key === 'BACKSPACE') { setCurrentGuess(g => g.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(g => g + key);
    }
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

  // Emoji grid stays in the copied text — that's intentional
  const emojiGrid = guesses.map(g =>
    evaluateGuess(g, target)
      .map(r => r === 'correct' ? '🟩' : r === 'present' ? '🟨' : '⬛')
      .join('')
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

  const showModal = gameOver && !modalDismissed;

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-2">
      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <Link to="/games" className="text-sm text-neutral-500">← Games</Link>
        <h1 className="font-bold text-lg tracking-wide">Dirty Wordle</h1>
        <div className="w-14" />
      </div>

      <p className="text-xs text-neutral-400">{today} · New word at midnight</p>

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
              style={{
                display: 'flex', gap: 6,
                animation: isCurrent && shake ? 'wordle-shake 0.5s ease-in-out' : 'none',
              }}
            >
              {Array.from({ length: WORD_LENGTH }, (_, colIdx) => {
                const letter = word[colIdx] ?? '';
                const state  = result ? result[colIdx] : letter ? 'active' : 'empty';
                return (
                  <Tile
                    key={colIdx}
                    letter={letter}
                    state={state}
                    delay={colIdx * 80}
                    revealed={submitted}
                  />
                );
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
              <Key
                key={key}
                label={key}
                state={letterStates[key] ?? 'unused'}
                onPress={onKey}
              />
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
                  You got it!
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  {winMessage()}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold tracking-tight text-neutral-800 dark:text-white">
                  Better luck tomorrow
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  The word was{' '}
                  <span className="font-bold" style={{ color: '#ed70bd' }}>
                    {target}
                  </span>
                </p>
              </>
            )}

            {/* Colour grid — only the rows played */}
            <div className="flex flex-col items-center gap-1.5 py-1">
              {guesses.map((guess, rowIdx) => {
                const result = evaluateGuess(guess, target);
                return (
                  <div key={rowIdx} style={{ display: 'flex', gap: 5 }}>
                    {result.map((state, colIdx) => (
                      <div
                        key={colIdx}
                        style={{
                          width: 32, height: 32,
                          borderRadius: 5,
                          background:
                            state === 'correct' ? '#61dbbb'
                            : state === 'present' ? '#ed70bd'
                            : '#525252',
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-neutral-400">
              {won ? guesses.length : 'X'}/{MAX_GUESSES}
              {ptsEarned != null && (
                <span
                  className="ml-2 rounded-lg px-2 py-0.5 text-xs font-semibold"
                  style={{ background: '#61dbbb', color: '#0d3d2e' }}
                >
                  +{ptsEarned} pts
                </span>
              )}
            </p>

            <div className="flex flex-col gap-2">
              <button onClick={copyResult} className={TEAL_BTN}>
                {copied ? 'Copied!' : 'Copy result'}
              </button>
              <button onClick={() => setModalDismissed(true)} className={GHOST_BTN}>
                Close
              </button>
            </div>
          </div>
        </div>
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
