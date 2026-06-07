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
  const epoch = Math.floor(Date.now() / 86_400_000); // days since unix epoch
  return WORDS[epoch % WORDS.length];
}

function evaluateGuess(guess, target) {
  const result    = Array(WORD_LENGTH).fill('absent');
  const targetArr = target.split('');
  const guessArr  = guess.split('');

  // Pass 1 — correct position
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] === targetArr[i]) {
      result[i]    = 'correct';
      targetArr[i] = null;
      guessArr[i]  = null;
    }
  }
  // Pass 2 — right letter, wrong position
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
  correct: '#16a34a',
  present: '#d97706',
  absent:  '#525252',
  active:  'transparent',
  empty:   'transparent',
};
const TILE_BORDER = {
  correct: '#16a34a',
  present: '#d97706',
  absent:  '#525252',
  active:  '#737373',
  empty:   '#d4d4d4',
};

function Tile({ letter, state, delay = 0, revealed }) {
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
        color:           ['correct','present','absent'].includes(state) ? '#fff' : 'inherit',
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

const KEY_BG = {
  correct: '#16a34a',
  present: '#d97706',
  absent:  '#525252',
  unused:  undefined, // uses CSS class
};

function Key({ label, state, onPress }) {
  const wide = label === 'ENTER' || label === '⌫';
  const bg   = KEY_BG[state];

  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPress(label); }}
      style={{
        height:          52,
        minWidth:        wide ? 56 : 36,
        padding:         wide ? '0 6px' : 0,
        borderRadius:    6,
        fontWeight:      700,
        fontSize:        wide ? 11 : 15,
        border:          'none',
        background:      bg,
        color:           bg ? '#fff' : undefined,
        cursor:          'pointer',
        userSelect:      'none',
        touchAction:     'none',
        transition:      'background 0.15s',
      }}
      className={!bg ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-600 dark:text-neutral-100' : ''}
    >
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DirtyWordlePage() {
  const today      = getTodayDate();
  const target     = getDailyWord();
  const storageKey = `dirty-wordle-${today}`;

  // Load persisted state for today
  const loadSaved = () => {
    try { return JSON.parse(localStorage.getItem(storageKey)) ?? {}; } catch { return {}; }
  };
  const saved = loadSaved();

  const [guesses,      setGuesses]      = useState(saved.guesses   ?? []);
  const [currentGuess, setCurrentGuess] = useState('');
  const [gameOver,     setGameOver]     = useState(saved.gameOver  ?? false);
  const [won,          setWon]          = useState(saved.won       ?? false);
  const [ptsEarned,    setPtsEarned]    = useState(saved.ptsEarned ?? null);
  const [shake,        setShake]        = useState(false);
  const [copied,       setCopied]       = useState(false);

  // Persist on change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ guesses, gameOver, won, ptsEarned }));
  }, [guesses, gameOver, won, ptsEarned, storageKey]);

  // Best letter state seen across all guesses (for keyboard colouring)
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
    if (key === 'ENTER')                          { submitGuess(); return; }
    if (key === '⌫' || key === 'BACKSPACE')       { setCurrentGuess(g => g.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(g => g + key);
    }
  }, [gameOver, submitGuess, currentGuess]);

  // Physical keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if      (e.key === 'Enter')              onKey('ENTER');
      else if (e.key === 'Backspace')          onKey('BACKSPACE');
      else if (/^[a-zA-Z]$/.test(e.key))      onKey(e.key.toUpperCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onKey]);

  // Share result
  const emojiGrid = guesses.map(g =>
    evaluateGuess(g, target)
      .map(r => r === 'correct' ? '🟩' : r === 'present' ? '🟨' : '⬛')
      .join('')
  ).join('\n');
  const shareText = `💦 Dirty Wordle ${today}\n${won ? guesses.length : 'X'}/${MAX_GUESSES}\n\n${emojiGrid}`;

  const copyResult = () => {
    navigator.clipboard?.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Win messages
  const winMessage = () => {
    if (guesses.length === 1) return '🤯 First try?! You filthy genius!';
    if (guesses.length <= 2) return '🔥 Two guesses. Suspiciously good.';
    if (guesses.length <= 4) return '😏 Got there in the end.';
    return '😅 Close call but you did it!';
  };

  return (
    <div className="flex flex-col items-center gap-4 py-4 px-2">
      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <Link to="/games" className="text-sm text-neutral-500">← Games</Link>
        <h1 className="font-bold text-lg tracking-wide">💦 Dirty Wordle</h1>
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
                const letter   = word[colIdx] ?? '';
                const state    = result ? result[colIdx] : letter ? 'active' : 'empty';
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

      {/* Game-over card */}
      {gameOver && (
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 text-center space-y-2 mt-1">
          {won ? (
            <>
              <p className="font-bold text-lg text-emerald-600">{winMessage()}</p>
              {ptsEarned != null && (
                <p className="text-sm font-semibold text-amber-700">+{ptsEarned} pts earned</p>
              )}
            </>
          ) : (
            <>
              <p className="font-bold text-lg text-red-600">😳 Better luck tomorrow!</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                The word was{' '}
                <span className="font-bold text-neutral-900 dark:text-white">{target}</span>
              </p>
            </>
          )}
          <button
            onClick={copyResult}
            className="mt-1 rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            {copied ? '✓ Copied!' : 'Share result 📋'}
          </button>
        </div>
      )}

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
