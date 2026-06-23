import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { hapticTap } from '../lib/haptics.js';

// Native pull-to-refresh: drag down from the top of any page to reload its
// content. Shows a plum spinner that tracks the pull, and reloads on release
// past the threshold. Native shell only (the browser has its own pull-refresh).
const THRESHOLD = 70;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(0);
  const startX = useRef(0);
  const active = useRef(false);
  const decided = useRef(false); // have we locked this gesture as a vertical pull?
  const armed = useRef(false);   // fired the "crossed the release threshold" haptic yet?

  // Horizontal swipes near the screen edges open the menu drawer (left) and the
  // account panel (right). Ignore gestures that start in those zones so the
  // refresh spinner never flashes while pulling the drawer out.
  const EDGE_ZONE = 32;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e) => {
      const x = e.touches[0].clientX;
      if (refreshing || !atTop() || x <= EDGE_ZONE || x >= window.innerWidth - EDGE_ZONE) {
        active.current = false; return;
      }
      start.current = e.touches[0].clientY;
      startX.current = x;
      active.current = true;
      decided.current = false;
      armed.current = false;
    };
    const onMove = (e) => {
      if (!active.current || refreshing) return;
      const dy = e.touches[0].clientY - start.current;
      const dx = e.touches[0].clientX - startX.current;
      // Lock the gesture's axis once it has moved a meaningful amount. If it's
      // mostly horizontal (a drawer pull), abandon — don't show the spinner.
      if (!decided.current) {
        if (Math.abs(dx) <= 8 && Math.abs(dy) <= 8) return; // wait for a clear direction
        if (Math.abs(dx) > Math.abs(dy)) { active.current = false; setPull(0); return; }
        decided.current = true;
      }
      const next = dy > 0 && atTop() ? Math.min(110, dy * 0.5) : 0;
      // Buzz once the moment the pull passes the release threshold, so you can
      // feel exactly when letting go will trigger a refresh. Re-arms if you ease
      // back below it.
      if (next >= THRESHOLD && !armed.current) { armed.current = true; hapticTap(); }
      else if (next < THRESHOLD && armed.current) { armed.current = false; }
      setPull(next);
    };
    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      setPull((p) => {
        if (p >= THRESHOLD) {
          setRefreshing(true);
          setTimeout(() => window.location.reload(), 350);
          return THRESHOLD;
        }
        return 0;
      });
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [refreshing]);

  if (pull <= 0 && !refreshing) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[150] flex justify-center"
      style={{ transform: `translateY(${pull}px)`, transition: active.current ? 'none' : 'transform 0.2s ease', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <img
        src="/refresh.svg"
        alt=""
        width="140"
        height="140"
        className={`mt-2 drop-shadow-lg ${refreshing ? 'animate-spin' : ''}`}
        style={{
          // While being pulled, do a fast clean side-to-side ±22.5° jiggle;
          // `linear` keeps it a crisp back-and-forth with no soft overshoot/
          // wobble. While refreshing, fall back to a steady spin (animate-spin).
          transformOrigin: 'center center',
          animation: refreshing ? undefined : 'ptr-jiggle 0.18s linear infinite',
        }}
      />
    </div>
  );
}
