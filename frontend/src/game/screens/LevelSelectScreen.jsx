/**
 * LevelSelectScreen
 *
 * 3×2 grid of stage cards.  Only Mill Road Ruckus is playable;
 * the remaining five show a locked/coming-soon state.
 *
 * Navigation: ←↑↓→ to move cursor, ENTER to select.
 * Click also works — single click moves cursor, double-click selects.
 */

import { useEffect, useRef, useState } from 'react';
import { useGamepadMenu } from '../hooks/useGamepadMenu.js';
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
    id:        'coming_soon_4',
    name:      'COMING SOON',
    available: false,
    thumb:     null,
  },
  {
    id:        'coming_soon_5',
    name:      'COMING SOON',
    available: false,
    thumb:     null,
  },
  {
    id:        'coming_soon_3',
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

export default function LevelSelectScreen({ onSelect, onBack, audio }) {
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);

  const moveCursor = (delta) => {
    setCursor(c => {
      const next = Math.max(0, Math.min(LEVELS.length - 1, c + delta));
      if (next !== c) { audio?.playMenuMove(); cursorRef.current = next; }
      return next;
    });
  };

  const doConfirm = () => {
    const lvl = LEVELS[cursorRef.current];
    if (lvl?.available) { audio?.playMenuConfirm(); onSelect(lvl); }
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Escape')      { audio?.playMenuBack(); onBack(); return; }
      if (e.code === 'ArrowLeft')   moveCursor(-1);
      if (e.code === 'ArrowRight')  moveCursor(+1);
      if (e.code === 'ArrowUp')     moveCursor(-COLS);
      if (e.code === 'ArrowDown')   moveCursor(+COLS);
      if (e.code === 'Enter')       doConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSelect, onBack, audio]);

  useGamepadMenu({
    onLeft:    () => moveCursor(-1),
    onRight:   () => moveCursor(+1),
    onUp:      () => moveCursor(-COLS),
    onDown:    () => moveCursor(+COLS),
    onConfirm: doConfirm,
    onBack:    () => { audio?.playMenuBack(); onBack(); },
  });

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
              onClick={() => { if (cursor !== i) { audio?.playMenuMove(); setCursor(i); } }}
              onDoubleClick={() => { if (lvl.available) { audio?.playMenuConfirm(); onSelect(lvl); } }}
              className="relative overflow-hidden cursor-pointer select-none"
              style={{
                border:     `${selected ? '4px' : '1px'} solid ${selected ? accent : '#ffffff1a'}`,
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

              {/* Unavailable overlay — no lock icon */}
              {!lvl.available && (
                <div
                  className="absolute inset-0"
                  style={{ background: 'rgba(0,0,0,0.65)' }}
                />
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
        D-PAD/←↑↓→ NAVIGATE &nbsp;·&nbsp; A/ENTER SELECT &nbsp;·&nbsp; B/ESC BACK
      </p>
    </div>
  );
}
