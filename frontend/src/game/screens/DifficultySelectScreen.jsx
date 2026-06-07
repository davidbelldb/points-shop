/**
 * DifficultySelectScreen
 *
 * Three difficulty options: Easy / Medium / Good Luck.
 * Appears between the title screen and character select.
 *
 * Navigation: ← / → or A / D · ENTER to confirm · ESC back
 * Click moves cursor; double-click confirms.
 */

import { useEffect, useRef, useState } from 'react';
import { useGamepadMenu } from '../hooks/useGamepadMenu.js';

const DIFFICULTIES = [
  {
    id:     'easy',
    name:   'EASY',
    flavor: 'A WALK IN THE PARK',
    color:  '#4ade80',
  },
  {
    id:     'medium',
    name:   'MEDIUM',
    flavor: 'THINGS ARE GETTING REAL',
    color:  '#fbbf24',
  },
  {
    id:     'hard',
    name:   'GOOD LUCK',
    flavor: "YOU'RE GONNA NEED IT",
    color:  '#ef4444',
  },
];

export default function DifficultySelectScreen({ onSelect, onBack, audio }) {
  const [cursor,  setCursor]  = useState(0);
  const [confirm, setConfirm] = useState(false);
  const cursorRef = useRef(0);

  const moveCursor = (delta) => {
    setCursor(c => {
      const next = Math.max(0, Math.min(DIFFICULTIES.length - 1, c + delta));
      if (next !== c) { audio?.playMenuMove(); cursorRef.current = next; }
      return next;
    });
  };

  const doConfirm = () => {
    audio?.playMenuConfirm();
    setConfirm(true);
    setTimeout(() => onSelect(DIFFICULTIES[cursorRef.current].id), 350);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Escape')                                       { audio?.playMenuBack(); onBack(); return; }
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA')              moveCursor(-1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD')              moveCursor(+1);
      if (e.code === 'Enter')                                        doConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSelect, onBack, audio]);

  useGamepadMenu({
    onLeft:    () => moveCursor(-1),
    onRight:   () => moveCursor(+1),
    onConfirm: doConfirm,
    onBack:    () => { audio?.playMenuBack(); onBack(); },
  });

  const pick = (i) => {
    if (cursor !== i) { audio?.playMenuMove(); setCursor(i); }
  };
  const confirm2x = (i) => {
    audio?.playMenuConfirm();
    setCursor(i);
    setConfirm(true);
    setTimeout(() => onSelect(DIFFICULTIES[i].id), 350);
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-black gap-10"
      style={{ fontFamily: 'var(--font-pixel)' }}
    >
      {/* Header */}
      <h2
        className="uppercase select-none"
        style={{
          fontSize:    '0.7rem',
          letterSpacing: '0.3em',
          color:       '#fff',
          textShadow:  '0 0 14px #ffffff66',
        }}
      >
        SELECT DIFFICULTY
      </h2>

      {/* Difficulty cards */}
      <div className="flex gap-8">
        {DIFFICULTIES.map((diff, i) => {
          const sel = cursor === i;
          return (
            <div
              key={diff.id}
              onClick={() => pick(i)}
              onDoubleClick={() => confirm2x(i)}
              className="relative flex flex-col items-center justify-center cursor-pointer select-none gap-4"
              style={{
                width:      185,
                height:     210,
                border:     `${sel ? '4px' : '1px'} solid ${sel ? diff.color : '#ffffff18'}`,
                boxShadow:  sel ? `0 0 28px ${diff.color}66, inset 0 0 14px ${diff.color}18` : 'none',
                background: sel ? `${diff.color}0e` : '#0d0d0d',
                opacity:    confirm && !sel ? 0.25 : 1,
                transition: 'all 0.13s',
              }}
            >
              {/* Name */}
              <span
                className="uppercase"
                style={{
                  fontSize:      '0.6rem',
                  letterSpacing: '0.2em',
                  color:         sel ? diff.color : '#ffffffcc',
                  textShadow:    sel ? `0 0 10px ${diff.color}` : 'none',
                }}
              >
                {diff.name}
              </span>

              {/* Flavor text */}
              <span
                className="uppercase text-center px-3"
                style={{
                  fontSize:      '0.38rem',
                  letterSpacing: '0.1em',
                  lineHeight:    1.6,
                  color:         sel ? `${diff.color}cc` : '#ffffff33',
                }}
              >
                {diff.flavor}
              </span>

              {/* Selected indicator */}
              {sel && (
                <div
                  className="absolute top-2 right-2"
                  style={{ fontSize: '0.55rem', color: diff.color, textShadow: `0 0 6px ${diff.color}` }}
                >
                  ▶
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <p
        className="select-none"
        style={{ fontSize: '0.45rem', letterSpacing: '0.15em', color: '#ffffff22' }}
      >
        D-PAD/←/→ SELECT &nbsp;·&nbsp; A/ENTER CONFIRM &nbsp;·&nbsp; B/ESC BACK
      </p>
    </div>
  );
}
