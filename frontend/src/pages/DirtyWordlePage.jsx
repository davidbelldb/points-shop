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
import { useTheme } from '../lib/ThemeContext.jsx';
import { hapticTap, hapticTug, hapticSharpTriple, hapticParty, hapticShudder } from '../lib/haptics.js';

// ─── Word list ────────────────────────────────────────────────────────────────

const WORDS = [
  // ── Your suggestions ──────────────────────────────────────────────────────
  'FILTH','SLUTS','SLAGS','WHORE','WANKY','BOOBS','TITTY','BUTTS','WILLY','BITCH',
  'STIFF','COCKS','PUSSY','CUNTS','TWATS','NECKS','PLUGS','KATIE','DAVID',
  'STUFF','CREAM','KNEES','DOGGY','BRACE','SLAPS','CHOKE',
  // ── Dirty classics ────────────────────────────────────────────────────────
  'HORNY','DIRTY','SPANK','LUSTY','KINKY','NAKED','BOOTY','ERECT','LOVER','COCKY',
  'BALLS','BONER','PERVY','RANDY','JUICY','NUDES','PANTY','THONG','GROAN','MOANS',
  'LICKS','TEASE','FLIRT','STRIP','NASTY','NYMPH','TABOO','SHAFT','GRIND','STRAP',
  'TOUCH','TWERK','VULVA','DICKS','PRICK','TAINT','SPUNK','SAUCY','FLESH','FANNY',
  'MOIST','GROPE','THROB','PORNO','CRUDE','SEXTS','TRYST','DADDY','THIGH','VIXEN',
  'BAWDY','STUDS','WENCH','TRAMP','SMUTS','LETCH','KNOBS','WANKS','SHAGS','BONKS',
  'HUMPS','ROMPS','LOINS','GROIN','BUSTY','BUXOM','TARTS','HUSSY','KINKS','ARSES',
  'MILFS','MUFFS','BOUND','ROUGH','DILDO','FUCKS','SUCKS','BLOWS',
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

// Returns today's date as YYYY-MM-DD in the Europe/London timezone.
// Uses formatToParts for reliable cross-browser/Safari support.
function getTodayDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function formatUKDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year}`;
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
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
                  : state === 'empty' ? (isDark ? '#2a2a28' : '#ebebea')
                  : isDark ? '#525252' : '#939391',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

const TILE_TEXT = { correct: '#0d3d2e', present: '#fff' };

function Tile({ letter, state, colIdx = 0, animating = false, isDark }) {
  const isColoured = ['correct','present','absent'].includes(state);
  const absentBg   = isDark ? '#525252' : '#939391';

  // Final (revealed) colors
  const toBg   = state === 'correct' ? '#61dbbb'
               : state === 'present' ? '#ed70bd'
               : state === 'absent'  ? absentBg
               : isDark ? '#1f1f1e' : '#e8e8e6';
  const toBord = state === 'correct' ? '#61dbbb'
               : state === 'present' ? '#ed70bd'
               : state === 'absent'  ? absentBg
               : state === 'active'  ? (isDark ? '#6b6b68' : '#a3a3a0')
               : (isDark ? '#30302e' : '#d4d4d0');
  const toText = state === 'absent'  ? '#ffffff'
               : isColoured          ? TILE_TEXT[state]
               : (isDark ? '#ffffff' : '#171717');

  // Starting (uncoloured) colors used before the flip animation reveals the result
  const fromBg   = isDark ? '#1f1f1e' : '#e8e8e6';
  const fromBord = isDark ? '#6b6b68' : '#a3a3a0';
  const fromText = isDark ? '#ffffff'  : '#171717';

  // 'dw-flip-hit' includes a pulse for correct/present; 'dw-flip-miss' is flip only
  const isPulse  = animating && (state === 'correct' || state === 'present');
  const animName = animating ? (isPulse ? 'dw-flip-hit' : 'dw-flip-miss') : 'none';
  const delay    = colIdx * 100; // ms stagger between tiles

  if (animating) {
    return (
      <div
        style={{
          width: 56, height: 56,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 700,
          borderRadius: 6,
          border: `2px solid ${fromBord}`,
          background: fromBg,
          color: fromText,
          '--tf': fromBg, '--tb': fromBord, '--cf': fromText,
          '--tc': toBg,   '--tbc': toBord,  '--ct': toText,
          animation: `${animName} 650ms ease-in-out ${delay}ms both`,
        }}
      >
        {letter}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 56, height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 700,
        border: `2px solid ${toBord}`,
        borderRadius: 6,
        background: toBg,
        color: toText,
        transform: letter && !isColoured ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.1s, border-color 0.1s',
      }}
    >
      {letter}
    </div>
  );
}

// ─── Keyboard key ─────────────────────────────────────────────────────────────

const KEY_BG = {
  correct: '#61dbbb',
  present: '#ed70bd',
  absent:  { dark: '#525252', light: '#939391' },   // matches tile absent colour per mode
  unused:  { dark: '#2e2e2c', light: '#e8e8e6' },   // darker  = "default keyboard"
};
const KEY_TEXT = { correct: '#0d3d2e', present: '#fff', absent: '#fff', unused: { dark: '#ffffff', light: '#171717' } };

function Key({ label, state, onPress, isDark }) {
  const wide = label === 'ENTER' || label === '⌫';
  let bg, color;
  if (wide) { bg = '#1d4039'; color = '#ffffff'; }
  else if (state === 'correct') { bg = KEY_BG.correct; color = KEY_TEXT.correct; }
  else if (state === 'present') { bg = KEY_BG.present; color = KEY_TEXT.present; }
  else if (state === 'absent') { bg = isDark ? KEY_BG.absent.dark : KEY_BG.absent.light; color = '#fff'; }
  else { bg = isDark ? KEY_BG.unused.dark : KEY_BG.unused.light; color = isDark ? '#fff' : '#171717'; }
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPress(label); }}
      style={{
        height: 52, flex: wide ? 1.5 : 1, padding: 0,
        borderRadius: 6, fontWeight: 700, fontSize: wide ? 11 : 15,
        border: 'none', background: bg, color,
        cursor: 'pointer', userSelect: 'none', touchAction: 'none', transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// ─── Button styles ────────────────────────────────────────────────────────────

const TEAL_BTN  = 'flex-1 inline-flex items-center justify-center rounded-xl bg-[#61dbbb] px-4 py-3 text-sm font-semibold text-[#0d3d2e] transition hover:opacity-90 active:scale-95';
const GHOST_BTN = 'flex-1 inline-flex items-center justify-center rounded-xl border border-neutral-400 bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-200 active:scale-95 dark:border-neutral-500 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600';

// ─── Leaderboard modal ────────────────────────────────────────────────────────

// Build a compact PNG of just the completed guess rows — no labels, no empty rows.
// Used for the "Share in chat" button so the shared image is as small as the result.
function buildShareBlob(resultGrid) {
  return new Promise((resolve) => {
    const CELL = 40;
    const GAP  = 5;
    const PAD  = 10;
    const COLS = resultGrid[0]?.length ?? WORD_LENGTH;
    const ROWS = resultGrid.length;

    const W = COLS * CELL + (COLS - 1) * GAP + PAD * 2;
    const H = ROWS * CELL + (ROWS - 1) * GAP + PAD * 2;

    const canvas = document.createElement('canvas');
    const DPR = 2;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    ctx.fillStyle = '#1e1e1c';
    ctx.fillRect(0, 0, W, H);

    const cellColor = (s) =>
      s === 'correct' ? '#61dbbb' : s === 'present' ? '#ed70bd' : '#525252';

    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    resultGrid.forEach((row, ri) => {
      row.forEach((state, ci) => {
        const cx = PAD + ci * (CELL + GAP);
        const cy = PAD + ri * (CELL + GAP);
        ctx.fillStyle = cellColor(state);
        roundRect(cx, cy, CELL, CELL, 6);
        ctx.fill();
      });
    });

    canvas.toBlob(resolve, 'image/png');
  });
}

// Draw the two-player side-by-side grid onto an offscreen canvas and return
// it as a PNG Blob. Pure canvas — no html2canvas dependency needed.
function buildGridBlob(players, todayRows, viewDate) {
  return new Promise((resolve) => {
    const CELL  = 28;          // px per grid cell
    const COLS  = WORD_LENGTH; // 5
    const ROWS  = MAX_GUESSES; // 6
    const GAP   = 4;           // gap between cells
    const PAD   = 20;          // outer padding
    const INNER = 16;          // card inner padding
    const TITLE_H  = 32;       // name label height
    const SCORE_H  = 42;       // score + pts pill area
    const GRID_W   = COLS * CELL + (COLS - 1) * GAP;
    const GRID_H   = ROWS * CELL + (ROWS - 1) * GAP;
    const CARD_W   = GRID_W + INNER * 2;
    const CARD_H   = TITLE_H + GRID_H + SCORE_H + INNER * 2;
    const NUM_CARDS = players.length;
    const CARD_GAP  = 12;
    const W = NUM_CARDS * CARD_W + (NUM_CARDS - 1) * CARD_GAP + PAD * 2;
    const H = CARD_H + PAD * 2 + 28; // 28px for date label at top

    const canvas = document.createElement('canvas');
    const DPR = 2; // retina
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    // Background
    ctx.fillStyle = '#1e1e1c';
    ctx.fillRect(0, 0, W, H);

    // Date label
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = '#737373';
    ctx.textAlign = 'center';
    const [, mm, dd] = viewDate.split('-');
    ctx.fillText(`Dirdle · ${dd}/${mm}`, W / 2, PAD + 4);

    const cellColor = (state) => {
      if (state === 'correct') return '#61dbbb';
      if (state === 'present') return '#ed70bd';
      if (state === 'empty')   return '#2a2a28';
      return '#525252'; // absent
    };

    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    players.forEach((player, idx) => {
      const played = todayRows.find(t => t.name === player.name);
      const playerColor = idx === 0 ? '#61dbbb' : '#ed70bd';
      const cardX = PAD + idx * (CARD_W + CARD_GAP);
      const cardY = PAD + 20;

      // Card background
      ctx.fillStyle = '#30302e';
      roundRect(cardX, cardY, CARD_W, CARD_H, 12);
      ctx.fill();

      // Player name
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = playerColor;
      ctx.textAlign = 'center';
      ctx.fillText(player.name.toUpperCase(), cardX + CARD_W / 2, cardY + INNER + 16);

      // Grid
      const grid = played?.guess_grid ?? Array(ROWS).fill(Array(COLS).fill('empty'));
      const gridX = cardX + INNER;
      const gridY = cardY + INNER + TITLE_H;
      grid.forEach((row, ri) => {
        row.forEach((state, ci) => {
          const cx = gridX + ci * (CELL + GAP);
          const cy = gridY + ri * (CELL + GAP);
          ctx.fillStyle = cellColor(state);
          roundRect(cx, cy, CELL, CELL, 4);
          ctx.fill();
        });
      });

      // Score text
      if (played) {
        const scoreY = gridY + GRID_H + 10;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = '#a3a3a3';
        ctx.textAlign = 'center';
        const scoreLabel = played.won ? `${played.guesses_taken}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
        ctx.fillText(scoreLabel, cardX + CARD_W / 2, scoreY + 12);

        if (played.pts > 0) {
          // Pts pill
          const pillW = 64, pillH = 22, pillR = 8;
          const pillX = cardX + CARD_W / 2 - pillW / 2;
          const pillY = scoreY + 18;
          ctx.fillStyle = '#61dbbb';
          roundRect(pillX, pillY, pillW, pillH, pillR);
          ctx.fill();
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.fillStyle = '#0d3d2e';
          ctx.fillText(`+${played.pts} pts`, cardX + CARD_W / 2, pillY + 15);
        }
      }
    });

    canvas.toBlob(resolve, 'image/png');
  });
}

function LeaderboardModal({ onClose, today }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [viewDate,   setViewDate]   = useState(today);
  const { theme } = useTheme();
  const { user }  = useAuth();
  const dark = theme === 'dark';

  const minDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const isToday = viewDate === today;

  function formatViewDate(dateStr) {
    const [yyyy, mm, dd] = dateStr.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatDayMonth(dateStr) {
    const [, mm, dd] = dateStr.split('-');
    return `${dd}/${mm}`;
  }

  function getDayLabel(dateStr) {
    if (dateStr === today) return 'TODAY';
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    if (dateStr === yest.toISOString().slice(0, 10)) return 'YESTERDAY';
    const days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    return days[new Date(dateStr + 'T12:00:00').getDay()];
  }

  function navigateDate(delta) {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (next >= minDate && next <= today) setViewDate(next);
  }

  useEffect(() => {
    setLoading(true);
    setData(null);
    api.dirtyWordleLeaderboard(viewDate)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [viewDate]);

  const modalBg   = dark ? '#1e1e1c' : '#ffffff';
  const cardBg    = dark ? '#30302e' : '#f5f5f4';
  const cardBorder= dark ? '#3a3a38' : '#e5e5e5';
  const tableBg   = dark ? '#30302e' : '#f5f5f4';
  const tableHead = dark ? '#252523' : '#e5e5e5';
  const rowBg     = dark ? '#2a2a28' : '#ffffff';
  const rowBorder = dark ? '#3a3a38' : '#e5e5e5';
  const textPri   = dark ? '#ffffff' : '#171717';
  const textSec   = dark ? '#a3a3a3' : '#737373';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden" style={{ background: modalBg }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="font-bold text-lg tracking-tight" style={{ color: '#ed70bd' }}>Dirdle Leaderboard</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: textSec, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, fontSize: 22, padding: '0 0 0 8px' }}>✕</button>
        </div>

        <div className="px-5 pb-3 space-y-6 max-h-[80vh] overflow-y-auto">
          {loading && <p className="text-sm text-center" style={{ color: textSec }}>Loading...</p>}
          {!loading && !data && <p className="text-sm text-center" style={{ color: textSec }}>Couldn't load scores.</p>}

          {data && (
            <>
              {/* ── Today's grids ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: textSec }}>
                    {getDayLabel(viewDate)}
                  </p>
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: textSec }}>
                      {formatViewDate(viewDate)}
                    </p>
                    <button onClick={() => navigateDate(-1)} disabled={viewDate <= minDate}
                      style={{ background: 'none', border: 'none', cursor: viewDate <= minDate ? 'default' : 'pointer',
                        color: textPri, fontSize: 20, lineHeight: 1, padding: '0 4px',
                        opacity: viewDate <= minDate ? 0.25 : 1, position: 'relative', top: '-1px' }}>
                      ‹
                    </button>
                    <button onClick={() => navigateDate(1)} disabled={viewDate >= today}
                      style={{ background: 'none', border: 'none', cursor: viewDate >= today ? 'default' : 'pointer',
                        color: textPri, fontSize: 20, lineHeight: 1, padding: '0 4px',
                        opacity: viewDate >= today ? 0.25 : 1, position: 'relative', top: '-1px' }}>
                      ›
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {data.allTime.map(player => {
                    const played = data.today.find(t => t.name === player.name);
                    const emptyRow = Array(WORD_LENGTH).fill('empty');
                    const emptyGrid = Array(MAX_GUESSES).fill(emptyRow);
                    const playerColor = player.name === user?.name ? '#61dbbb' : '#ed70bd';
                    // Fixed card height: enough for name + 6-row grid + score line
                    const cardHeight = 280;
                    // Grid zone: 6 rows × 24px + 5 gaps × 4px = 164px
                    const gridZoneH = MAX_GUESSES * 24 + (MAX_GUESSES - 1) * 4;
                    return played ? (
                      <div
                        key={player.name}
                        className="rounded-xl p-3 flex flex-col items-center justify-between"
                        style={{ background: cardBg, border: `1px solid ${cardBorder}`, height: cardHeight }}
                      >
                        {/* Top: name */}
                        <p className="text-sm font-bold uppercase tracking-wide" style={{ color: playerColor }}>{player.name}</p>
                        {/* Middle: fixed-height grid zone so grids always start at same Y */}
                        <div style={{ height: gridZoneH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ColourGrid grid={played.guess_grid} cellSize={24} />
                        </div>
                        {/* Bottom: score + pts pill */}
                        <div className="text-center space-y-0.5">
                          <p className="text-xs" style={{ color: textSec }}>
                            {played.won ? `${played.guesses_taken}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}
                          </p>
                          {played.pts > 0 && (
                            <span className="inline-block rounded-lg px-2 py-0.5 text-xs font-semibold"
                              style={{ background: '#61dbbb', color: '#0d3d2e' }}>
                              +{played.pts} pts
                            </span>
                          )}
                          {!played.won && (
                            <p className="text-xs" style={{ color: '#ed70bd' }}>No points</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={player.name}
                        className="rounded-xl p-3 flex flex-col items-center justify-center gap-2"
                        style={{ background: cardBg, border: `1px dashed ${cardBorder}`, height: cardHeight }}
                      >
                        <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-full"
                          style={{ border: `3px solid ${playerColor}` }}>
                          {player.photo_url
                            ? <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
                            : <span className="flex h-full w-full items-center justify-center text-sm font-bold"
                                style={{ background: cardBorder, color: textPri }}>
                                {player.name?.[0]}
                              </span>
                          }
                        </span>
                        <p className="text-sm font-bold uppercase tracking-wide" style={{ color: playerColor }}>
                          {player.name}
                        </p>
                        <p className="text-xs text-center font-semibold uppercase tracking-wide leading-relaxed" style={{ color: textSec }}>
                          {isToday
                            ? <>yet to play<br />today</>
                            : <>didn't play<br />on {formatDayMonth(viewDate)}</>
                          }
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Current series stats ── */}
              {data.allTime.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: textSec }}>
                    {data.current_series_name ?? 'Current series'}
                  </p>
                  <div className="rounded-xl overflow-hidden" style={{ background: tableBg, border: `1px solid ${cardBorder}` }}>
                    {/* Header */}
                    <div className="grid px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                      style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: tableHead, color: textSec }}>
                      <span>Player</span>
                      <span className="text-center">Wins</span>
                      <span className="text-center">Avg</span>
                      <span className="text-center">Pts</span>
                      <span className="text-center">Series</span>
                    </div>
                    {data.allTime.map(player => {
                      const noSeriesYet = data.completed_series_count === 0;
                      const seriesDisplay = noSeriesYet ? '-' : (player.series_wins ?? 0);
                      return (
                        <div
                          key={player.name}
                          className="grid px-3 py-2.5 text-sm items-center"
                          style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: rowBg, borderTop: `1px solid ${rowBorder}` }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="block h-7 w-7 shrink-0 overflow-hidden rounded-full"
                              style={{ border: `2px solid ${cardBorder}` }}>
                              {player.photo_url
                                ? <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
                                : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold"
                                    style={{ background: cardBorder, color: textPri }}>
                                    {player.name?.[0]}
                                  </span>
                              }
                            </span>
                            <span className="truncate font-semibold" style={{ color: textPri }}>{player.name}</span>
                          </div>
                          <span className="text-center font-bold" style={{ color: '#61dbbb' }}>{player.wins}</span>
                          <span className="text-center" style={{ color: textSec }}>{player.avg_guesses}</span>
                          <span className="text-center" style={{ color: textSec }}>{player.total_pts}</span>
                          <span className="text-center font-bold" style={{ color: noSeriesYet ? textSec : '#ed70bd' }}>{seriesDisplay}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DirtyWordlePage() {
  const { user }   = useAuth();
  const { theme }  = useTheme();
  const today      = getTodayDate();
  const storageKey = `dirty-wordle-${user?.id ?? 'guest'}-${today}`;

  // Word is fetched from server to guarantee the same word for all players
  // and to enforce non-repeating cycle logic.
  const [target, setTarget] = useState(null);

  const loadSaved = () => {
    try { return JSON.parse(localStorage.getItem(storageKey)) ?? {}; } catch { return {}; }
  };
  const saved = loadSaved();

  const [guesses,          setGuesses]          = useState(saved.guesses      ?? []);
  const [currentGuess,     setCurrentGuess]     = useState('');
  const [revealingRow,     setRevealingRow]     = useState(null);
  const [gameOver,         setGameOver]         = useState(saved.gameOver     ?? false);
  const [won,              setWon]              = useState(saved.won          ?? false);
  const [ptsEarned,        setPtsEarned]        = useState(saved.ptsEarned    ?? null);
  const [shake,            setShake]            = useState(false);
  const [sharing,          setSharing]          = useState(false);
  const [shared,           setShared]           = useState(false);
  const [modalDismissed,   setModalDismissed]   = useState(saved.modalAcked   ?? false);
  const [resultSaved,      setResultSaved]      = useState(saved.resultSaved  ?? false);
  const [showLeaderboard,  setShowLeaderboard]  = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);

  // On mount: fetch today's word + sync progress from server.
  useEffect(() => {
    async function syncFromServer() {
      try {
        // 1. Fetch today's assigned word from server
        const { word } = await api.dirtyWordleWord(today);
        setTarget(word);

        // 2. Try in-progress guesses
        const { guesses: serverGuesses } = await api.dirtyWordleProgress(today);
        // Always apply server state — even empty — to prevent bleed from another user's localStorage.
        setGuesses(serverGuesses ?? []);
        if (serverGuesses && serverGuesses.length > 0) {
          // Recompute derived state from loaded guesses
          const lastGuess = serverGuesses[serverGuesses.length - 1];
          const isWon  = lastGuess === word;
          const isOver = isWon || serverGuesses.length >= MAX_GUESSES;
          if (isWon)  setWon(true);
          if (isOver) setGameOver(true);
          if (isOver && !saved.modalAcked) setModalDismissed(false);
        } else {
          // No guesses on server → fresh game for this user; clear any stale local state.
          setGameOver(false);
          setWon(false);
          setPtsEarned(null);
          setModalDismissed(false);
          setResultSaved(false);
        }
      } catch {
        // Server unreachable — fall back to client-side word derivation
        const [yyyy, mm, dd] = today.split('-').map(Number);
        const epoch = Math.floor(Date.UTC(yyyy, mm - 1, dd) / 86_400_000);
        setTarget(WORDS[epoch % WORDS.length]);
      } finally {
        setProgressLoaded(true);
      }
    }
    syncFromServer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      guesses, gameOver, won, ptsEarned, modalAcked: modalDismissed, resultSaved,
    }));
  }, [guesses, gameOver, won, ptsEarned, modalDismissed, resultSaved, storageKey]);

  const letterStates = useMemo(() => {
    if (!target) return {};
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
    if (!target) return;
    if (currentGuess.length !== WORD_LENGTH) {
      setShake(true);
      hapticTug(); // gentle "not yet" for an incomplete word
      setTimeout(() => setShake(false), 500);
      return;
    }
    const newGuesses = [...guesses, currentGuess];
    const isWon      = currentGuess === target;
    const isOver     = isWon || newGuesses.length >= MAX_GUESSES;

    // Kick off the flip animation for the just-submitted row; clear after all tiles finish
    const rowIdx = guesses.length;
    setRevealingRow(rowIdx);
    setTimeout(() => setRevealingRow(null), 1400);

    // Haptics timed to the tile reveal: three sharp taps per letter as each
    // tile flips over (the flip stagger is colIdx*100ms with a ~650ms flip, so
    // each tile turns edge-on and reveals its colour ~230ms into its own
    // animation). Once the last tile has flipped, finish with a Candy-Crush
    // party flourish on a win, or the wrong-passcode shudder on any miss.
    const FLIP_STAGGER = 100; // must match Tile's `colIdx * 100`
    const FLIP_OVER_MS = 230; // when a tile reveals mid-flip
    for (let c = 0; c < WORD_LENGTH; c++) {
      setTimeout(hapticSharpTriple, c * FLIP_STAGGER + FLIP_OVER_MS);
    }
    const lastRevealMs = (WORD_LENGTH - 1) * FLIP_STAGGER + FLIP_OVER_MS;
    setTimeout(() => { if (isWon) hapticParty(); else hapticShudder(); }, lastRevealMs + 360);

    setGuesses(newGuesses);
    setCurrentGuess('');
    // Persist progress to server so any device can resume
    api.dirtyWordleSaveProgress({ date: today, guesses: newGuesses }).catch(() => {});
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
        guesses: newGuesses,
      })
        .then(r => { setPtsEarned(isWon ? r.pts : 0); setResultSaved(true); })
        .catch(() => { setPtsEarned(fallbackPts); setResultSaved(false); });
    }
  }, [currentGuess, guesses, target, today]);

  const onKey = useCallback((key) => {
    if (!target || gameOver) return;
    if (key === 'ENTER')                    { submitGuess(); return; }
    if (key === '⌫' || key === 'BACKSPACE') { setCurrentGuess(g => g.slice(0, -1)); hapticTap(); return; }
    if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) { setCurrentGuess(g => g + key); hapticTap(); }
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

  async function shareResultToChat() {
    setSharing(true);
    try {
      const player = { name: user?.name, photo_url: user?.photo_url };
      const todayRow = {
        name: user?.name,
        guess_grid: resultGrid,
        won,
        guesses_taken: guesses.length,
        pts: ptsEarned ?? 0,
      };
      const blob = await buildShareBlob(resultGrid);
      const file = new File([blob], 'wordle-result.png', { type: 'image/png' });
      const { url } = await api.upload(file);
      await api.sendMessage(url);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch (e) {
      console.error('Share failed', e);
    } finally {
      setSharing(false);
    }
  }

  const winMessage = () => {
    if (guesses.length === 1) return 'First try. You filthy genius.';
    if (guesses.length <= 2)  return 'Two guesses. Suspiciously good.';
    if (guesses.length <= 4)  return 'Got there in the end.';
    return 'Close call — but you did it!';
  };

  const showModal  = gameOver && !modalDismissed && !!target;
  const resultGrid = target ? guesses.map(g => evaluateGuess(g, target)) : [];

  const isDark = theme === 'dark';

  // Scroll to top on mount — iOS PWA can restore a mid-page scroll position
  // when navigating back to the game, hiding the title/scores header.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between px-2">
        <Link to="/games" className="w-20 text-sm text-neutral-500">← Games</Link>
        <h1 className="font-bold text-lg tracking-wide">Dirdle</h1>
        <button
          onClick={() => setShowLeaderboard(true)}
          className="w-20 text-right text-sm font-medium px-2 py-1 rounded-lg transition text-neutral-500"
        >
          Scores
        </button>
      </div>

      <p className="text-xs text-neutral-400">{formatUKDate()} — Another day, another dirdle.</p>

      {/* Grid — held back until server sync completes to avoid empty flash */}
      <div className="flex flex-col gap-1.5" style={{ opacity: progressLoaded ? 1 : 0, transition: 'opacity 0.15s' }}>
        {Array.from({ length: MAX_GUESSES }, (_, rowIdx) => {
          const submitted = rowIdx < guesses.length;
          const isCurrent = rowIdx === guesses.length && !gameOver;
          const word      = submitted ? guesses[rowIdx] : isCurrent ? currentGuess : '';
          const result    = submitted && target ? evaluateGuess(word, target) : null;
          return (
            <div
              key={rowIdx}
              style={{ display: 'flex', gap: 6, animation: isCurrent && shake ? 'wordle-shake 0.5s ease-in-out' : 'none' }}
            >
              {Array.from({ length: WORD_LENGTH }, (_, colIdx) => {
                const letter = word[colIdx] ?? '';
                const state  = result ? result[colIdx] : letter ? 'active' : 'empty';
                return <Tile key={colIdx} letter={letter} state={state} colIdx={colIdx} animating={submitted && rowIdx === revealingRow} isDark={isDark} />;
              })}
            </div>
          );
        })}
      </div>

      {/* On-screen keyboard — edge to edge */}
      <div className="w-full flex flex-col gap-1.5 mt-1 px-1">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 4 }}>
            {row.map(key => (
              <Key key={key} label={key} state={letterStates[key] ?? 'unused'} onPress={onKey} isDark={isDark} />
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
              <button onClick={shareResultToChat} disabled={sharing || shared} className={`${TEAL_BTN} disabled:opacity-50`}>
                {shared ? '✓ Sent to chat!' : sharing ? 'Sending…' : 'Share in chat'}
              </button>
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

        /* Tile flip for correct/present tiles — flip reveals colour then pulses */
        @keyframes dw-flip-hit {
          0%   { transform: perspective(250px) rotateX(0deg)   scale(1);   background: var(--tf);  border-color: var(--tb);  color: var(--cf); }
          46%  { transform: perspective(250px) rotateX(-90deg) scale(1);   background: var(--tf);  border-color: var(--tb);  color: var(--cf); }
          54%  { transform: perspective(250px) rotateX(90deg)  scale(1);   background: var(--tc);  border-color: var(--tbc); color: var(--ct); }
          78%  { transform: perspective(250px) rotateX(0deg)   scale(1);   background: var(--tc);  border-color: var(--tbc); color: var(--ct); }
          90%  { transform: scale(1.14);                                    background: var(--tc);  border-color: var(--tbc); color: var(--ct); }
          100% { transform: scale(1);                                       background: var(--tc);  border-color: var(--tbc); color: var(--ct); }
        }

        /* Tile flip for absent tiles — flip only, no pulse */
        @keyframes dw-flip-miss {
          0%   { transform: perspective(250px) rotateX(0deg)   scale(1);   background: var(--tf);  border-color: var(--tb);  color: var(--cf); }
          46%  { transform: perspective(250px) rotateX(-90deg) scale(1);   background: var(--tf);  border-color: var(--tb);  color: var(--cf); }
          54%  { transform: perspective(250px) rotateX(90deg)  scale(1);   background: var(--tc);  border-color: var(--tbc); color: var(--ct); }
          100% { transform: perspective(250px) rotateX(0deg)   scale(1);   background: var(--tc);  border-color: var(--tbc); color: var(--ct); }
        }
      `}</style>
    </div>
  );
}
