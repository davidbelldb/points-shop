/**
 * VSScreen
 *
 * Classic beat-em-up VS face-off screen displayed between level select and the fight.
 * Characters slide in from opposite sides, names flash, then the screen auto-advances.
 *
 * Props:
 *   sprites      — SpriteManager (used to draw character portraits on canvas)
 *   playerCharId — 'katie' | 'david'
 *   cpuCharId    — 'david' | 'katie'
 *   onComplete   — callback fired after animation completes (~3.5 s)
 */

import { useEffect, useRef, useState } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT }  from '../constants.js';

// ─── Character portrait (canvas-rendered sprite) ──────────────────────────────

function CharPortrait({ sprites, charId, flip, width = 200, height = 260 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !sprites) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const img = sprites.get(`${charId}_idle`);
    if (!img) return;

    const scale = Math.min((width * 0.82) / img.width, (height * 0.82) / img.height);
    const dw    = img.width  * scale;
    const dh    = img.height * scale;
    const dx    = (width  - dw) / 2;
    const dy    = (height - dh) / 2;

    ctx.save();
    if (flip) {
      // Mirror horizontally so CPU faces the player
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }, [sprites, charId, flip, width, height]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const NAMES = { katie: 'KATIE', david: 'DAVID' };

export default function VSScreen({ sprites, playerCharId, cpuCharId, rightTag = 'CPU', onComplete }) {
  const [entered,    setEntered]    = useState(false);
  const [vsVisible,  setVsVisible]  = useState(false);
  const [nameFlash,  setNameFlash]  = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setEntered(true),    50);
    const t2 = setTimeout(() => setVsVisible(true),  380);
    const t3 = setTimeout(() => setNameFlash(true),  500);
    const t4 = setTimeout(() => onComplete(),        3500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onComplete]);

  // Name flash toggle
  const [flashOn, setFlashOn] = useState(true);
  useEffect(() => {
    if (!nameFlash) return;
    const id  = setInterval(() => setFlashOn(v => !v), 220);
    const off = setTimeout(() => { clearInterval(id); setFlashOn(true); }, 1800);
    return () => { clearInterval(id); clearTimeout(off); };
  }, [nameFlash]);

  const SLIDE = 'transform 0.52s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s';

  return (
    <div
      style={{
        position:   'absolute',
        inset:      0,
        background: 'radial-gradient(ellipse at center, #12101e 0%, #000 75%)',
        overflow:   'hidden',
        fontFamily: 'var(--font-pixel)',
        userSelect: 'none',
      }}
    >
      {/* Keyframes injected once */}
      <style>{`
        @keyframes vsPulse {
          0%,100%{ text-shadow: 0 0 30px #ef4444, 0 0 60px #ef4444aa, 4px 4px 0 #000; }
          50%    { text-shadow: 0 0 55px #fbbf24, 0 0 90px #fbbf24aa, 4px 4px 0 #000; }
        }
        @keyframes scanline {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
      `}</style>

      {/* Subtle scanline sweep */}
      <div style={{
        position:        'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', opacity: 0.05,
      }}>
        <div style={{
          position:   'absolute', left: 0, right: 0, height: 60,
          background: 'linear-gradient(transparent, #fff 50%, transparent)',
          animation:  'scanline 3.5s linear once',
        }} />
      </div>

      {/* Hard vertical split lines */}
      <div style={{ position: 'absolute', left: '38%', top: 0, bottom: 0, width: 1, background: '#ffffff18' }} />
      <div style={{ position: 'absolute', left: '62%', top: 0, bottom: 0, width: 1, background: '#ffffff18' }} />

      {/* ── Player side (left) ── */}
      <div style={{
        position:   'absolute',
        left: 0, top: 0, bottom: 0,
        width:      '38%',
        display:    'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap:        12,
        transform:  entered ? 'translateX(0)' : 'translateX(-340px)',
        opacity:    entered ? 1 : 0,
        transition: SLIDE,
      }}>
        {/* P1 tag */}
        <span style={{ fontSize: '0.4rem', letterSpacing: '0.3em', color: '#60a5fa88' }}>PLAYER 1</span>

        {/* Portrait */}
        <div style={{ border: '2px solid #60a5fa44', boxShadow: '0 0 30px #60a5fa22' }}>
          <CharPortrait sprites={sprites} charId={playerCharId} flip={false} />
        </div>

        {/* Name */}
        <span style={{
          fontSize:    '1.35rem',
          letterSpacing: '0.15em',
          color:       flashOn ? '#fbbf24' : '#fbbf2488',
          textShadow:  '0 0 20px #fbbf2488, 3px 3px 0 #000',
          transition:  'color 0.1s',
        }}>
          {NAMES[playerCharId] ?? playerCharId.toUpperCase()}
        </span>
      </div>

      {/* ── VS (centre) ── */}
      <div style={{
        position:  'absolute',
        left: '38%', right: '38%',
        top: 0, bottom: 0,
        display:   'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: vsVisible ? 'scale(1)' : 'scale(2.2)',
        opacity:   vsVisible ? 1 : 0,
        transition: 'transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s',
      }}>
        <span style={{
          fontSize:  '3.5rem',
          color:     '#ef4444',
          animation: vsVisible ? 'vsPulse 1.1s ease-in-out infinite' : 'none',
          textShadow: '0 0 30px #ef4444, 4px 4px 0 #000',
          letterSpacing: '0.05em',
        }}>
          VS
        </span>
      </div>

      {/* ── CPU side (right) ── */}
      <div style={{
        position:   'absolute',
        right: 0, top: 0, bottom: 0,
        width:      '38%',
        display:    'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap:        12,
        transform:  entered ? 'translateX(0)' : 'translateX(340px)',
        opacity:    entered ? 1 : 0,
        transition: SLIDE,
      }}>
        {/* CPU tag */}
        <span style={{ fontSize: '0.4rem', letterSpacing: '0.3em', color: '#f87171aa' }}>{rightTag}</span>

        {/* Portrait — flipped so CPU faces the player */}
        <div style={{ border: '2px solid #ef444444', boxShadow: '0 0 30px #ef444422' }}>
          <CharPortrait sprites={sprites} charId={cpuCharId} flip={true} />
        </div>

        {/* Name */}
        <span style={{
          fontSize:    '1.35rem',
          letterSpacing: '0.15em',
          color:       flashOn ? '#ef4444' : '#ef444488',
          textShadow:  '0 0 20px #ef444488, 3px 3px 0 #000',
          transition:  'color 0.1s',
        }}>
          {NAMES[cpuCharId] ?? cpuCharId.toUpperCase()}
        </span>
      </div>

      {/* Bottom hint */}
      <div style={{
        position: 'absolute', bottom: 14, left: 0, right: 0,
        textAlign: 'center',
        fontSize: '0.4rem', letterSpacing: '0.2em',
        color: '#ffffff22',
        opacity: vsVisible ? 1 : 0, transition: 'opacity 0.5s 0.6s',
      }}>
        FIGHT!
      </div>
    </div>
  );
}
