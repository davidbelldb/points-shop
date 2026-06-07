/**
 * LevelSelectScreen
 *
 * 3×2 grid of stage cards.  Only Mill Road Ruckus is playable;
 * the remaining five show a locked/coming-soon state.
 *
 * Navigation: ←↑↓→ to move cursor, ENTER to select.
 * Click also works — single click moves cursor, double-click selects.
 */

import { useEffect, useState } from 'react';
import bg03Url from '../../assets/backgrounds/background_03.png';

const COLS = 3;

export const LEVELS = [
  {
    id:        'mill_road',
    name:      'MILL ROAD RUCKUS',
    available: true,
    bgKey:     'bg_01',         // key in the SpriteManager manifest
    thumb:     bg03Url,
  },
  {
    id:        'king_street',
    name:      'KING STREET RAGE',
    available: false,
    thumb:     null,
  },
  {
    id:        'blinco',
    name:      'BATTLE ON BLINCO',
    available: false,
    thumb:     null,
  },
  {
    id:        'bishops',
    name:      'COMING SOON',
    available: false,
    thumb:     null,
  },
  {
    id:        'coming_soon_1',
    name:      'COMING SOON',
    available: false,
    thumb:     null,
  },
  {
    id:        'coming_soon_2',
    name:      'COMING SOON',
    available: false,
    thumb:     null,
  },
];

export default function LevelSelectScreen({ onSelect, onBack }) {
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Escape')     { onBack(); return; }
      if (e.code === 'ArrowLeft')  setCursor(c => Math.max(0, c - 1));
      if (e.code === 'ArrowRight') setCursor(c => Math.min(LEVELS.length - 1, c + 1));
      if (e.code === 'ArrowUp')    setCursor(c => c - COLS >= 0 ? c - COLS : c);
      if (e.code === 'ArrowDown')  setCursor(c => c + COLS < LEVELS.length ? c + COLS : c);
      if (e.code === 'Enter') {
        const lvl = LEVELS[cursor];
        if (lvl.available) onSelect(lvl);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cursor, onSelect, onBack]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-black gap-6"
      style={{ fontFamily: 'var(--font-pixel)' }}
    >
      {/* Header */}
      <h2
        className="uppercase text-white select-none"
        style={{ fontSize: '0.7rem', letterSpacing: '0.3em', textShadow: '0 0 12px #ffffff66' }}
      >
        SELECT STAGE
      </h2>

      {/* Grid */}
      <div
        style={{
          display:               'grid',
          gridTemplateColumns:   `repeat(${COLS}, 210px)`,
          gridTemplateRows:      'repeat(2, 120px)',
          gap:                   '12px',
        }}
      >
        {LEVELS.map((lvl, i) => {
          const selected = cursor === i;
          const accent   = '#fbbf24';

          return (
            <div
              key={lvl.id + i}
              onClick={() => setCursor(i)}
              onDoubleClick={() => { if (lvl.available) onSelect(lvl); }}
              className="relative overflow-hidden cursor-pointer select-none"
              style={{
                border:     `2px solid ${selected ? accent : '#ffffff1a'}`,
                boxShadow:  selected ? `0 0 18px ${accent}55` : 'none',
                background: '#0d0d0d',
                transition: 'border-color 0.12s, box-shadow 0.12s',
              }}
            >
              {/* Thumbnail */}
              {lvl.thumb ? (
                <img
                  src={lvl.thumb}
                  alt=""
                  style={{
                    width:      '100%',
                    height:     '100%',
                    objectFit:  'cover',
                    opacity:    0.85,
                    imageRendering: 'pixelated',
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
              {!lvl.available && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                  style={{ background: 'rgba(0,0,0,0.65)' }}
                >
                  <span style={{ fontSize: '1.2rem', color: '#ffffff22' }}>🔒</span>
                </div>
              )}

              {/* Name bar */}
              <div
                className="absolute bottom-0 left-0 right-0 px-2 py-1"
                style={{ background: 'rgba(0,0,0,0.78)' }}
              >
                <span
                  className="uppercase"
                  style={{
                    fontSize:      '0.55rem',
                    letterSpacing: '0.08em',
                    color:      lvl.available
                      ? (selected ? accent : '#ffffffcc')
                      : '#ffffff33',
                    textShadow: selected && lvl.available ? `0 0 8px ${accent}` : 'none',
                  }}
                >
                  {lvl.name}
                </span>
              </div>

              {/* Selected indicator arrow */}
              {selected && lvl.available && (
                <div
                  className="absolute top-1 right-1"
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
      <p className="select-none" style={{ fontSize: '0.45rem', letterSpacing: '0.15em', color: '#ffffff22' }}>
        ←↑↓→ NAVIGATE &nbsp;·&nbsp; ENTER SELECT &nbsp;·&nbsp; ESC BACK
      </p>
    </div>
  );
}
