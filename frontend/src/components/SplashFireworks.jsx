import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/* A one-shot launch flourish: lots of splash.png copies burst across the screen
   at varied sizes, offsets and rotations like fireworks, then the overlay
   removes itself after ~1.5s. Native shell only, once per app session. */

let splashDone = false;
const COUNT = 18;

export default function SplashFireworks() {
  const [show, setShow] = useState(() => !splashDone && Capacitor.isNativePlatform());

  useEffect(() => {
    if (!show) return undefined;
    splashDone = true;
    const t = setTimeout(() => setShow(false), 1500);
    return () => clearTimeout(t);
  }, [show]);

  // Randomise once so the burst is stable across the (single) render.
  const particles = useMemo(
    () => Array.from({ length: COUNT }, () => ({
      left: 6 + Math.random() * 88,        // vw %
      top: 10 + Math.random() * 74,        // vh %
      s0: 0.04 + Math.random() * 0.05,     // start scale (tiny)
      s1: 0.14 + Math.random() * 0.30,     // end scale (pop out)
      r0: Math.random() * 40 - 20,         // start rotation
      r1: Math.random() * 80 - 40,         // end rotation
      delay: Math.random() * 0.8,          // s
      dur: 0.45 + Math.random() * 0.4,     // s
    })),
    [],
  );

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[300] overflow-hidden">
      {particles.map((p, i) => (
        <img
          key={i}
          src="/splash.png"
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: '60vw',                 // base; the transform scales it down
            transform: 'translate(-50%, -50%)',
            willChange: 'transform, opacity',
            '--s0': p.s0,
            '--s1': p.s1,
            '--r0': `${p.r0}deg`,
            '--r1': `${p.r1}deg`,
            animation: `splash-pop ${p.dur}s ease-out ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  );
}
