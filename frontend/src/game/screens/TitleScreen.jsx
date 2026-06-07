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

      {/* PRESS ENTER overlay — centred */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <p
          style={{
            fontFamily:   'var(--font-pixel)',
            fontSize:     '0.7rem',
            letterSpacing:'0.2em',
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
        style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.4rem', color: '#ffffff22' }}
      >
        © 2026 SNEAKY POINTS
      </p>
    </div>
  );
}
