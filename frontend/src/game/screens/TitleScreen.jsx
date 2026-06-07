/**
 * TitleScreen
 *
 * title_screen.png background with animated rain and lightning overlay.
 * ENTER key or tap/click to advance.
 */

import { useEffect, useRef, useState } from 'react';
import titleBgUrl from '../../assets/backgrounds/title_screen.png';

export default function TitleScreen({ onStart, audio }) {
  const [blink, setBlink] = useState(true);
  const canvasRef = useRef(null);
  const stateRef  = useRef(null);
  const rafRef    = useRef(null);

  // "PRESS ENTER" blink
  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(id);
  }, []);

  // Keyboard + click/tap to start
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Enter') {
        audio?.playMenuConfirm();
        onStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart, audio]);

  // Rain + lightning canvas animation
  useEffect(() => {
    const W = 800, H = 450, N = 200;

    stateRef.current = {
      drops: Array.from({ length: N }, () => ({
        x:     Math.random() * W,
        y:     Math.random() * H,
        speed: 360 + Math.random() * 280,
        len:   7 + Math.random() * 11,
        alpha: 0.10 + Math.random() * 0.28,
      })),
      lt: {
        alpha:      0,
        nextFlash:  2.5 + Math.random() * 4.5,
        strobing:   false,
      },
      lastNow: null,
    };

    const draw = (now) => {
      const s = stateRef.current;
      if (!s) return;
      if (s.lastNow === null) s.lastNow = now;
      const dt = Math.min((now - s.lastNow) / 1000, 0.05);
      s.lastNow = now;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);

      // ── Rain ──────────────────────────────────────────────────────────
      ctx.save();
      ctx.lineWidth = 0.9;
      for (const d of s.drops) {
        d.x += d.speed * dt * 0.20;
        d.y += d.speed * dt;
        if (d.y > H + 20)  { d.y = -15; d.x = Math.random() * (W + 60) - 30; }
        if (d.x > W + 40)  { d.x = -20; d.y = Math.random() * H * 0.6; }
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.20, d.y + d.len);
        ctx.strokeStyle = `rgba(185,215,255,${d.alpha})`;
        ctx.stroke();
      }
      ctx.restore();

      // ── Lightning ─────────────────────────────────────────────────────
      const L = s.lt;
      L.nextFlash -= dt;
      if (L.nextFlash <= 0 && !L.strobing) {
        L.strobing   = true;
        L.alpha      = 0.22 + Math.random() * 0.24;
        L.nextFlash  = 3.8 + Math.random() * 6;
        // Second strobe flash
        setTimeout(() => {
          if (stateRef.current) {
            stateRef.current.lt.alpha    = 0.12 + Math.random() * 0.14;
            stateRef.current.lt.strobing = false;
          }
        }, 70 + Math.random() * 60);
      }
      if (L.alpha > 0) {
        ctx.fillStyle = `rgba(210,230,255,${L.alpha})`;
        ctx.fillRect(0, 0, W, H);
        L.alpha = Math.max(0, L.alpha - dt * 11);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      stateRef.current = null;
    };
  }, []);

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-black"
      onClick={() => { audio?.playMenuConfirm(); onStart(); }}
      style={{ cursor: 'pointer' }}
    >
      {/* Background */}
      <img
        src={titleBgUrl}
        alt=""
        className="w-full h-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Rain + lightning overlay */}
      <canvas
        ref={canvasRef}
        width={800}
        height={450}
        style={{
          position:      'absolute',
          inset:         0,
          width:         '100%',
          height:        '100%',
          pointerEvents: 'none',
        }}
      />

      {/* PRESS ENTER — centred in the bottom third (~y 375/450) */}
      <div className="absolute inset-x-0 flex justify-center pointer-events-none select-none" style={{ top: '82%' }}>
        <p
          style={{
            fontFamily:    'var(--font-pixel)',
            fontSize:      '0.7rem',
            letterSpacing: '0.2em',
            color:         '#ffffff',
            opacity:       blink ? 1 : 0,
            transition:    'opacity 0.15s',
            textShadow:    '0 0 16px #fff, 0 0 32px #fff',
          }}
        >
          PRESS ENTER TO START
        </p>
      </div>

      <p
        className="absolute bottom-2 right-3 select-none pointer-events-none"
        style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.4rem', color: '#ffffff22' }}
      >
        © 2026 SNEAKY POINTS
      </p>
    </div>
  );
}
