/**
 * TitleScreen
 *
 * Placeholder black title screen.
 * Will later receive 8-bit music and a proper title graphic.
 * Press ENTER to advance to character select.
 */

import { useEffect, useState } from 'react';

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
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-black gap-16"
      style={{ fontFamily: "'Courier New', monospace" }}
    >
      {/* Title */}
      <div className="flex flex-col items-center gap-3 select-none">
        <h1
          className="text-6xl font-bold tracking-[0.2em] text-white uppercase"
          style={{ textShadow: '0 0 30px #c060ff, 0 0 60px #c060ff88' }}
        >
          BEAT ME UP
        </h1>
        <div
          className="text-sm tracking-[0.5em] uppercase"
          style={{ color: '#c060ff99' }}
        >
          ─────── streets edition ───────
        </div>
      </div>

      {/* Prompt */}
      <p
        className="text-sm tracking-[0.3em] uppercase text-white"
        style={{
          opacity:      blink ? 1 : 0,
          transition:   'opacity 0.15s',
          textShadow:   '0 0 10px #fff',
        }}
      >
        PRESS ENTER TO START
      </p>

      {/* Copyright placeholder */}
      <p className="absolute bottom-4 text-xs tracking-widest" style={{ color: '#ffffff22' }}>
        © 2026 SNEAKY POINTS
      </p>
    </div>
  );
}
