/**
 * CostumeSelectScreen
 *
 * 3-slot costume picker. One outfit available per character;
 * the remaining two show a locked / coming-soon state.
 *
 * Navigation: ←/→ or A/D · ENTER to confirm · click/double-click
 */

import { useEffect, useState } from 'react';
import katieDinoUrl  from '../../assets/character_costumes/katie_dino_dress.png';
import davidShirtUrl from '../../assets/character_costumes/david_shirt_jeans.png';

const COSTUMES = {
  katie: [
    {
      id:        'katie_dino_dress',
      name:      'DINO DRESS',
      available: true,
      image:     katieDinoUrl,
    },
    { id: 'katie_alt_1', name: 'COMING SOON', available: false },
    { id: 'katie_alt_2', name: 'COMING SOON', available: false },
  ],
  david: [
    {
      id:        'david_shirt_jeans',
      name:      'SHIRT & JEANS',
      available: true,
      image:     davidShirtUrl,
    },
    { id: 'david_alt_1', name: 'COMING SOON', available: false },
    { id: 'david_alt_2', name: 'COMING SOON', available: false },
  ],
};

const ACCENT = { katie: '#c060ff', david: '#40c8ff' };

export default function CostumeSelectScreen({ character, onSelect, onBack }) {
  const [cursor, setCursor] = useState(0);
  const costumes = COSTUMES[character] ?? COSTUMES.katie;
  const accent   = ACCENT[character] ?? '#fbbf24';

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Escape')                           { onBack(); return; }
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA')
        setCursor(c => Math.max(0, c - 1));
      if (e.code === 'ArrowRight' || e.code === 'KeyD')
        setCursor(c => Math.min(costumes.length - 1, c + 1));
      if (e.code === 'Enter') {
        const c = costumes[cursor];
        if (c.available) onSelect(c);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cursor, costumes, onSelect, onBack]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-black gap-8"
      style={{ fontFamily: 'monospace' }}
    >
      {/* Header */}
      <h2
        className="text-base tracking-[0.4em] uppercase select-none"
        style={{ color: '#fff', textShadow: '0 0 12px #ffffff66' }}
      >
        SELECT COSTUME
      </h2>

      {/* 3-card row */}
      <div className="flex gap-5">
        {costumes.map((costume, i) => {
          const selected = cursor === i;
          return (
            <div
              key={costume.id}
              onClick={() => setCursor(i)}
              onDoubleClick={() => { if (costume.available) onSelect(costume); }}
              className="relative overflow-hidden cursor-pointer select-none flex flex-col"
              style={{
                width:      200,
                height:     230,
                border:     `2px solid ${selected ? accent : '#ffffff1a'}`,
                boxShadow:  selected ? `0 0 20px ${accent}66` : 'none',
                background: selected ? `${accent}0d` : '#0d0d0d',
                transition: 'border-color 0.12s, box-shadow 0.12s, background 0.12s',
              }}
            >
              {/* Costume image or empty bg */}
              {costume.image ? (
                <img
                  src={costume.image}
                  alt={costume.name}
                  style={{
                    width:          '100%',
                    height:         '100%',
                    objectFit:      'cover',
                    objectPosition: 'center top',
                    imageRendering: 'pixelated',
                    opacity:        0.9,
                  }}
                />
              ) : (
                <div
                  style={{
                    width:      '100%',
                    height:     '100%',
                    background: 'linear-gradient(135deg, #0d0d18 0%, #12101a 100%)',
                  }}
                />
              )}

              {/* Locked overlay */}
              {!costume.available && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.72)' }}
                >
                  <span style={{ fontSize: '1.4rem', color: '#ffffff22' }}>🔒</span>
                </div>
              )}

              {/* Name bar */}
              <div
                className="absolute bottom-0 left-0 right-0 px-2 py-1.5"
                style={{ background: 'rgba(0,0,0,0.82)' }}
              >
                <span
                  className="text-xs tracking-wider uppercase block text-center"
                  style={{
                    color:      costume.available
                      ? (selected ? accent : '#ffffffcc')
                      : '#ffffff33',
                    textShadow: selected && costume.available ? `0 0 8px ${accent}` : 'none',
                  }}
                >
                  {costume.name}
                </span>
              </div>

              {/* Selected indicator */}
              {selected && costume.available && (
                <div
                  className="absolute top-1.5 right-1.5"
                  style={{ color: accent, fontSize: '0.6rem', textShadow: `0 0 6px ${accent}` }}
                >
                  ▶
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="text-xs tracking-widest select-none" style={{ color: '#ffffff22' }}>
        ←/→ NAVIGATE &nbsp;·&nbsp; ENTER SELECT &nbsp;·&nbsp; ESC BACK
      </p>
    </div>
  );
}
