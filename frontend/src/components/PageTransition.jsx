import { Suspense, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType, useNavigate, useOutlet } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/* Wraps the routed <Outlet/> to add two native-feeling behaviours:
 *
 * 1. Route transitions — each new page slides + fades in (forward = from the
 *    right, back = from the left) via CSS keyframe classes. Keyframes leave no
 *    lingering transform, so fixed-position modals inside pages stay anchored.
 *
 * 2. Interactive swipe-to-go-back — dragging in from the LEFT screen edge pulls
 *    the current page across with your finger; past ~a third of the width it
 *    commits and navigates back, otherwise it springs back. Gated to installed
 *    PWA / native shell (where there's no browser back-gesture to clash with),
 *    and only when there's somewhere to go back to.
 */

// Enable swipe-back only where there's no browser back-gesture to fight with:
// the installed PWA (display-mode standalone) or the Capacitor native shell.
const swipeBackEnv =
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator?.standalone === true ||
    Capacitor.isNativePlatform());

// Routes where the swipe-back should stay out of the way.
const SWIPE_BLOCKLIST = new Set(['/', '/games/streets-of-cambs-rage']);

export default function PageTransition() {
  const location = useLocation();
  const navType = useNavigationType(); // PUSH | REPLACE | POP
  const navigate = useNavigate();
  const outlet = useOutlet();

  // Suppress the entrance animation on the very first paint (cold load).
  const firstRef = useRef(true);
  const isFirst = firstRef.current;
  useEffect(() => { firstRef.current = false; }, []);
  const enterClass = isFirst ? '' : navType === 'POP' ? 'page-enter-back' : 'page-enter-fwd';

  // ── Swipe-to-go-back ──────────────────────────────────────────────────────
  const canGoBack =
    (window.history.state?.idx ?? 0) > 0 && !SWIPE_BLOCKLIST.has(location.pathname);

  const [dragX, setDragX] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const dragXRef = useRef(0);
  const gesture = useRef(null);

  const setX = (x) => { dragXRef.current = x; setDragX(x); };

  // Reset any drag offset whenever the route actually changes.
  useEffect(() => { setSnapping(false); setX(0); gesture.current = null; }, [location.key]);

  useEffect(() => {
    if (!canGoBack || !swipeBackEnv) return undefined;
    const EDGE = 28;      // px from the left edge to start a back-drag
    const AXIS_LOCK = 8;  // px before we decide horizontal vs vertical

    const onStart = (e) => {
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      gesture.current = { x0: t.clientX, y0: t.clientY, decided: false, active: true };
      setSnapping(false);
    };
    const onMove = (e) => {
      const g = gesture.current;
      if (!g?.active) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (!g.decided) {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        if (Math.abs(dy) > Math.abs(dx)) { g.active = false; return; } // vertical → let it scroll
        g.decided = true;
      }
      // Follow the finger (only rightward); mild resistance so it feels weighted.
      const x = Math.max(0, dx);
      setX(x * 0.9);
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      const g = gesture.current;
      gesture.current = null;
      if (!g?.decided) { setX(0); return; }
      const width = window.innerWidth || 1;
      setSnapping(true);
      if (dragXRef.current > width * 0.33) {
        setX(width);                         // slide fully off…
        window.setTimeout(() => navigate(-1), 200); // …then go back
      } else {
        setX(0);                             // not far enough — spring back
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [canGoBack, navigate]);

  const dragging = dragX > 0;
  // Only carry a transform while actively swiping — an idle translateX(0) would
  // still create a containing block and break fixed modals inside the page.
  const swipeStyle = dragging
    ? {
        transform: `translateX(${dragX}px)`,
        transition: snapping ? 'transform 200ms cubic-bezier(0.32,0.72,0,1)' : 'none',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.18)',
        willChange: 'transform',
      }
    : undefined;

  return (
    <div style={swipeStyle}>
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-400">
            Loading…
          </div>
        }
      >
        <div key={location.key} className={enterClass}>
          {outlet}
        </div>
      </Suspense>
    </div>
  );
}
