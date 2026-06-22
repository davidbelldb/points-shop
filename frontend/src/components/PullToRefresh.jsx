import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

// Native pull-to-refresh: drag down from the top of any page to reload its
// content. Shows a plum spinner that tracks the pull, and reloads on release
// past the threshold. Native shell only (the browser has its own pull-refresh).
const THRESHOLD = 70;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e) => {
      if (refreshing || !atTop()) { active.current = false; return; }
      start.current = e.touches[0].clientY;
      active.current = true;
    };
    const onMove = (e) => {
      if (!active.current || refreshing) return;
      const dy = e.touches[0].clientY - start.current;
      setPull(dy > 0 && atTop() ? Math.min(110, dy * 0.5) : 0);
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
      <div className="mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#a04d89] text-white shadow-lg">
        <svg
          className={refreshing ? 'animate-spin' : ''}
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          <path d="M21 3v6h-6" />
        </svg>
      </div>
    </div>
  );
}
