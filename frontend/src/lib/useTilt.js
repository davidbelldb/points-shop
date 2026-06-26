import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/* Subtle gyroscope parallax. Returns { x, y } roughly in -1..1, to multiply by a
   pixel strength and apply as a translate. The first reading calibrates "level"
   to however the phone is being held, so content doesn't start off-centre.
   iOS 13+ gates DeviceOrientation behind a permission prompt that must be
   triggered from a user gesture, so we ask on the first touch. Native only. */
export function useTilt() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const base = useRef(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let active = true;

    function onOrient(e) {
      if (!active) return;
      const g = e.gamma ?? 0; // left/right, degrees
      const b = e.beta ?? 0;  // front/back, degrees
      if (!base.current) base.current = { g, b };
      const x = Math.max(-1, Math.min(1, (g - base.current.g) / 28));
      const y = Math.max(-1, Math.min(1, (b - base.current.b) / 28));
      setTilt({ x, y });
    }
    const start = () => window.addEventListener('deviceorientation', onOrient);

    const DOE = window.DeviceOrientationEvent;
    let ask;
    if (DOE && typeof DOE.requestPermission === 'function') {
      ask = () => {
        DOE.requestPermission().then((r) => { if (r === 'granted') start(); }).catch(() => {});
        window.removeEventListener('touchend', ask);
      };
      window.addEventListener('touchend', ask, { once: true });
    } else {
      start();
    }

    return () => {
      active = false;
      window.removeEventListener('deviceorientation', onOrient);
      if (ask) window.removeEventListener('touchend', ask);
    };
  }, []);

  return tilt;
}
