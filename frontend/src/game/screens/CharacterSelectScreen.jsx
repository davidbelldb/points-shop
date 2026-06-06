/**
 * CharacterSelectScreen
 *
 * Placeholder character selection.
 *   Katie  — shows katie_idle sprite
 *   David  — coloured square until sprites exist
 *
 * LEFT / RIGHT or A / D to highlight.
 * ENTER to confirm.
 */

import { useEffect, useState } from 'react';
import katieIdleUrl from '../../assets/sprites/katie_idle.png';

const CHARACTERS = [
  {
    id:       'katie',
    name:     'KATIE',
    subtitle: 'The Dino Duchess',
    color:    '#c060ff',
  },
  {
    id:       'david',
    name:     'DAVID',
    subtitle: 'Coming Soon™',
    color:    '#40c8ff',
  },
];

export default function CharacterSelectScreen({ onSelect }) {
  const [cursor, setCursor] = useState(0);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') setCursor(0);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') setCursor(1);
      if (e.code === 'Enter') {
        setConfirm(true);
        setTimeout(() => onSelect(CHARACTERS[cursor].id), 400);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cursor, onSelect]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-black gap-10"
      style={{ fontFamily: "'Courier New', monospace" }}
    >
      {/* Header */}
      <h2
        className="text-xl tracking-[0.4em] uppercase text-white select-none"
        style={{ textShadow: '0 0 14px #ffffff66' }}
      >
        SELECT YOUR FIGHTER
      </h2>

      {/* Character cards */}
      <div className="flex gap-16 items-end">
        {CHARACTERS.map((char, i) => {
          const selected = cursor === i;
          return (
            <div
              key={char.id}
              onClick={() => { setCursor(i); }}
              onDoubleClick={() => { setCursor(i); setConfirm(true); setTimeout(() => onSelect(char.id), 400); }}
              className="flex flex-col items-center gap-3 cursor-pointer select-none"
              style={{ opacity: confirm && !selected ? 0.3 : 1, transition: 'opacity 0.3s' }}
            >
              {/* Portrait frame */}
              <div
                className="relative flex items-end justify-center"
                style={{
                  width:     140,
                  height:    200,
                  border:    `2px solid ${selected ? char.color : '#ffffff22'}`,
                  boxShadow: selected ? `0 0 24px ${char.color}88, inset 0 0 12px ${char.color}22` : 'none',
                  background: selected ? `${char.color}11` : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {char.id === 'katie' ? (
                  <img
                    src={katieIdleUrl}
                    alt="Katie"
                    style={{
                      height:          '100%',
                      imageRendering:  'pixelated',
                      objectFit:       'contain',
                      objectPosition:  'bottom',
                    }}
                  />
                ) : (
                  /* David placeholder square */
                  <div
                    style={{
                      width:      80,
                      height:     80,
                      background: char.color,
                      marginBottom: 16,
                      boxShadow:  `0 0 20px ${char.color}`,
                    }}
                  />
                )}

                {/* Selection arrow */}
                {selected && (
                  <div
                    className="absolute -bottom-6 text-lg"
                    style={{ color: char.color, textShadow: `0 0 8px ${char.color}` }}
                  >
                    ▲
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="flex flex-col items-center gap-1 mt-6">
                <span
                  className="text-base tracking-[0.3em] uppercase"
                  style={{ color: selected ? char.color : '#ffffff66', textShadow: selected ? `0 0 10px ${char.color}` : 'none' }}
                >
                  {char.name}
                </span>
                <span className="text-xs tracking-widest" style={{ color: '#ffffff33' }}>
                  {char.subtitle}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls hint */}
      <p className="text-xs tracking-widest text-white/20 mt-4">
        ←/→ SELECT &nbsp;·&nbsp; ENTER CONFIRM
      </p>
    </div>
  );
}
