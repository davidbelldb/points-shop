/**
 * SplashScreen
 *
 * Shows game_splash_01.png for 3 seconds while assets load,
 * then auto-advances to the title screen.
 * If assets finish before 3 s the timer still runs out fully.
 * If assets take longer than 3 s we wait for them before advancing.
 */

import { useEffect, useRef } from 'react';
import splashUrl from '../../assets/backgrounds/game_splash_01.png';

const SPLASH_DURATION = 3000; // ms

export default function SplashScreen({ ready, onContinue }) {
  const timerDone  = useRef(false);
  const assetsDone = useRef(false);

  const tryAdvance = () => {
    if (timerDone.current && assetsDone.current) onContinue();
  };

  // 3-second timer
  useEffect(() => {
    const id = setTimeout(() => {
      timerDone.current = true;
      tryAdvance();
    }, SPLASH_DURATION);
    return () => clearTimeout(id);
  }, []);

  // Watch for assets becoming ready
  useEffect(() => {
    if (!ready) return;
    assetsDone.current = true;
    tryAdvance();
  }, [ready]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <img
        src={splashUrl}
        alt="Beat Me Up"
        className="w-full h-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
