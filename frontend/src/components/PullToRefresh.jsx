import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { hapticTap } from '../lib/haptics.js';

// Native pull-to-refresh: drag down from the top of any page to reload its
// content. Shows a plum spinner that tracks the pull, and reloads on release
// past the threshold. Native shell only (the browser has its own pull-refresh).
//
// Tuned to require a *deliberate* downward pull so ordinary scrolling never
// triggers it: the finger has to travel a clear distance, the motion has to be
// dominantly vertical, and the first chunk of travel is a dead-zone (no spinner)
// before anything shows.
const THRESHOLD = 90;    // finger-damped pull distance needed to arm a refresh
const DECIDE_SLOP = 16;  // travel required before we lock the gesture's axis
const DIR_RATIO = 1.6;   // vertical must beat horizontal by this factor to count
const DEAD_ZONE = 28;    // initial pull swallowed before the spinner appears

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

  // Surfaces that OWN their vertical drags and must never arm a refresh: any
  // Google map (`.gm-style` — the footprints / crow-tracker / OMW / timeline maps,
  // where a downward pan would otherwise trigger a reload since the page is
  // full-screen and "at top"), plus anything explicitly opted out with
  // `data-no-ptr` (the full-screen story viewer, etc.). One check here disables
  // pull-to-refresh across all of them site-wide.
  const NO_PTR = '.gm-style, [data-no-ptr]';

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    // Many pages scroll an inner container rather than the window (messages,
    // lists, etc.), so window.scrollY stays 0 even when you're reading halfway
    // down. Walk up from the touch target: if any scrollable ancestor is already
    // scrolled, this is a scroll gesture, not a pull — leave it alone.
    const innerScrolled = (node) => {
      let el = node;
      while (el && el !== document.body && el !== document.documentElement) {
        if (el instanceof HTMLElement && el.scrollTop > 0) {
          const oy = getComputedStyle(el).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return true;
        }
        el = el.parentNode;
      }
      return false;
    };

    const onStart = (e) => {
      const x = e.touches[0].clientX;
      const optedOut = e.target instanceof Element && e.target.closest(NO_PTR);
      if (refreshing || !atTop() || optedOut || x <= EDGE_ZONE || x >= window.innerWidth - EDGE_ZONE || innerScrolled(e.target)) {
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
        // Wait until the finger has clearly committed to a direction.
        if (Math.abs(dx) < DECIDE_SLOP && Math.abs(dy) < DECIDE_SLOP) return;
        // Only a dominant *downward* drag counts. Anything sideways or upward
        // (i.e. an ordinary scroll flick) abandons the gesture entirely.
        if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * DIR_RATIO) { active.current = false; setPull(0); return; }
        decided.current = true;
      }
      // Swallow the first DEAD_ZONE px so a small pull never peeks the spinner.
      const raw = dy - DEAD_ZONE;
      const next = raw > 0 && atTop() ? Math.min(120, raw * 0.5) : 0;
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
