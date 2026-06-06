/**
 * TitleScreen
 *
 * Uses title_screen.png as the full-frame background.
 * Press ENTER to advance to character select.
 */

import { useEffect, useState } from 'react';
import titleBgUrl from '../../assets/backgrounds/title_screen.png';

export default function TitleScreen({ onStart }) {
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.code === 'Enter') onStart(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onStart]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Background image */}
      <img
        src={titleBgUrl}
        alt=""
        className="w-full h-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* PRESS ENTER overlay — pinned to bottom-centre */}
      <div className="absolute inset-0 flex items-end justify-center pb-10 pointer-events-none select-none">
        <p
          style={{
            fontFamily:   "'Courier New', monospace",
            fontSize:     '1.5rem',
            fontWeight:   900,
            letterSpacing:'0.35em',
            textTransform:'uppercase',
            color:        '#ffffff',
            opacity:      blink ? 1 : 0,
            transition:   'opacity 0.15s',
            textShadow:   '0 0 16px #fff, 0 0 32px #fff',
          }}
        >
          PRESS ENTER TO START
        </p>
      </div>

      {/* Copyright */}
      <p
        className="absolute bottom-2 right-3 text-xs tracking-widest select-none"
        style={{ fontFamily: 'monospace', color: '#ffffff22' }}
      >
        © 2026 SNEAKY POINTS
      </p>
    </div>
  );
}
