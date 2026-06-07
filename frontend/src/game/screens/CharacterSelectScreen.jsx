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
import katieSelectUrl from '../../assets/character_selections/katie_select.png';
import davidSelectUrl from '../../assets/character_selections/david_select.png';

const CHARACTERS = [
  { id: 'katie', name: 'KATIE', color: '#c060ff' },
  { id: 'david', name: 'DAVID', color: '#40c8ff' },
];

export default function CharacterSelectScreen({ onSelect, onBack }) {
  const [cursor, setCursor] = useState(0);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Escape')                           { onBack(); return; }
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') setCursor(0);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') setCursor(1);
      if (e.code === 'Enter') {
        setConfirm(true);
        setTimeout(() => onSelect(CHARACTERS[cursor].id), 400);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cursor, onSelect, onBack]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-black gap-10"
      style={{ fontFamily: 'var(--font-pixel)' }}
    >
      {/* Header */}
      <h2
        className="uppercase text-white select-none"
        style={{ fontSize: '0.7rem', letterSpacing: '0.3em', textShadow: '0 0 14px #ffffff66' }}
      >
        SELECT YOUR FIGHTER
      </h2>

      {/* Character cards */}
      <div className="flex gap-16">
        {CHARACTERS.map((char, i) => {
          const selected = cursor === i;
          return (
            <div
              key={char.id}
              onClick={() => setCursor(i)}
              onDoubleClick={() => { setCursor(i); setConfirm(true); setTimeout(() => onSelect(char.id), 400); }}
              className="relative overflow-hidden cursor-pointer select-none"
              style={{
                width:      200,
                height:     240,
                border:     `2px solid ${selected ? char.color : '#ffffff22'}`,
                boxShadow:  selected ? `0 0 24px ${char.color}88, inset 0 0 12px ${char.color}22` : 'none',
                background: selected ? `${char.color}0d` : '#0d0d0d',
                opacity:    confirm && !selected ? 0.3 : 1,
                transition: 'all 0.15s',
              }}
            >
              {/* Portrait image */}
              <img
                src={char.id === 'katie' ? katieSelectUrl : davidSelectUrl}
                alt={char.name}
                style={{
                  width:          '100%',
                  height:         '100%',
                  imageRendering: 'pixelated',
                  objectFit:      'cover',
                  objectPosition: 'center',
                }}
              />

              {/* Name bar — inside bottom of card */}
              <div
                className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-center"
                style={{ background: 'rgba(0,0,0,0.82)' }}
              >
                <span
                  className="uppercase"
                  style={{
                    fontSize:   '0.55rem',
                    letterSpacing: '0.2em',
                    color:      selected ? char.color : '#ffffffcc',
                    textShadow: selected ? `0 0 8px ${char.color}` : 'none',
                  }}
                >
                  {char.name}
                </span>
              </div>

              {/* Selected indicator */}
              {selected && (
                <div
                  className="absolute top-1.5 right-1.5"
                  style={{ fontSize: '0.6rem', color: char.color, textShadow: `0 0 6px ${char.color}` }}
                >
                  ▶
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls hint */}
      <p className="text-white/20 mt-4" style={{ fontSize: '0.45rem', letterSpacing: '0.15em' }}>
        ←/→ SELECT &nbsp;·&nbsp; ENTER CONFIRM &nbsp;·&nbsp; ESC BACK
      </p>
    </div>
  );
}
