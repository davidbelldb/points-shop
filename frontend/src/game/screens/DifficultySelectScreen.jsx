/**
 * DifficultySelectScreen
 *
 * Three difficulty options: Easy / Medium / Good Luck.
 * Appears between the title screen and character select.
 *
 * Navigation: ← / → or A / D · ENTER to confirm · ESC back
 * Click moves cursor; double-click confirms.
 */

import { useEffect, useState } from 'react';

const DIFFICULTIES = [
  {
    id:     'easy',
    name:   'EASY',
    flavor: 'A WALK IN THE PARK',
    icon:   '😌',
    color:  '#4ade80',
  },
  {
    id:     'medium',
    name:   'MEDIUM',
    flavor: 'THINGS ARE GETTING REAL',
    icon:   '😤',
    color:  '#fbbf24',
  },
  {
    id:     'hard',
    name:   'GOOD LUCK',
    flavor: "YOU'RE GONNA NEED IT",
    icon:   '💀',
    color:  '#ef4444',
  },
];

export default function DifficultySelectScreen({ onSelect, onBack, audio }) {
  const [cursor,  setCursor]  = useState(0);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Escape') {
        audio?.playMenuBack();
        onBack();
        return;
      }
      if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && cursor > 0) {
        audio?.playMenuMove();
        setCursor(c => c - 1);
      }
      if ((e.code === 'ArrowRight' || e.code === 'KeyD') && cursor < DIFFICULTIES.length - 1) {
        audio?.playMenuMove();
        setCursor(c => c + 1);
      }
      if (e.code === 'Enter') {
        audio?.playMenuConfirm();
        setConfirm(true);
        setTimeout(() => onSelect(DIFFICULTIES[cursor].id), 350);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cursor, onSelect, onBack, audio]);

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
              {/* Icon */}
              <span
                style={{
                  fontSize:   '2.4rem',
                  lineHeight: 1,
                  filter:     sel ? `drop-shadow(0 0 10px ${diff.color})` : 'none',
                  transition: 'filter 0.13s',
                }}
              >
                {diff.icon}
              </span>

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
        ←/→ SELECT &nbsp;·&nbsp; ENTER CONFIRM &nbsp;·&nbsp; ESC BACK
      </p>
    </div>
  );
}
