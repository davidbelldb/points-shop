/**
 * SplashScreen
 *
 * Shows game_splash.png full-frame while assets load in the background.
 * Once ready, prompts "PRESS ANY KEY" and advances on any keydown.
 */

import { useEffect, useState } from 'react';
import splashUrl from '../../assets/backgrounds/game_splash_01.png';

export default function SplashScreen({ ready, onContinue }) {
  const [blink, setBlink] = useState(true);

  // Blink the prompt
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => setBlink(b => !b), 500);
    return () => clearInterval(id);
  }, [ready]);

  // Any key advances once ready
  useEffect(() => {
    if (!ready) return;
    const handler = () => onContinue();
    window.addEventListener('keydown', handler, { once: true });
    return () => window.removeEventListener('keydown', handler);
  }, [ready, onContinue]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <img
        src={splashUrl}
        alt="Beat Me Up"
        className="w-full h-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-end pb-8">
        {!ready ? (
          <span
            className="font-mono text-white/50 text-xs tracking-widest animate-pulse"
          >
            LOADING…
          </span>
        ) : (
          <span
            className="font-mono text-white text-sm tracking-widest"
            style={{ opacity: blink ? 1 : 0, transition: 'opacity 0.1s', textShadow: '0 0 12px #fff' }}
          >
            PRESS ANY KEY
          </span>
        )}
      </div>
    </div>
  );
}
