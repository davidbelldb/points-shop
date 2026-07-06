import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';

// ── SheetIn ──────────────────────────────────────────────────────────────────
// Presents a route by sliding it up from the bottom of the screen, iOS-sheet
// style — but ONLY when navigation arrives with { state: { sheet: true } } (e.g.
// tapping the floating chat head). Any other entry renders plainly.
//
// IMPORTANT: the wrapped page mounts EXACTLY ONCE. We never swap the wrapper
// element out, so heavy pages (Messages, with its data fetch + lazy 3D trays)
// don't remount mid-transition — that remount was what caused the empty
// "No one to chat yet" flash and the trays popping in a second time.
//
// The slide is a plain CSS transform transition, and once it finishes we drop
// the transform entirely (settled state). A lingering transform would create a
// containing block that re-anchors the page's position:fixed overlays (composer,
// story viewer), so clearing it keeps those working normally.

export default function SheetIn({ children }) {
  const location = useLocation();
  const reduce = useReducedMotion();
  const shouldAnimate = !!location.state?.sheet && !reduce;

  const [entered, setEntered] = useState(!shouldAnimate); // false → start off-screen
  const [settled, setSettled] = useState(!shouldAnimate); // true  → transform removed

  // Kick the transition on the frame after mount so the initial translateY(100%)
  // paints first (double rAF is needed for the start frame to register).
  useEffect(() => {
    if (!shouldAnimate) return undefined;
    let r1 = 0, r2 = 0;
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setEntered(true)); });
    // Safety net: guarantee the transform is cleared even if transitionend is
    // missed (e.g. the transition gets interrupted), so fixed overlays are never
    // left re-anchored.
    const t = setTimeout(() => setSettled(true), 700);
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(t); };
    // Run once on mount — location.state is fixed for this presentation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!shouldAnimate) return children;

  return (
    <div
      onTransitionEnd={(e) => {
        // Ignore bubbled transitions from children — only our own slide counts.
        if (e.target === e.currentTarget && e.propertyName === 'transform') setSettled(true);
      }}
      style={
        settled
          ? undefined
          : {
              transform: entered ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 440ms cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'transform',
            }
      }
    >
      {children}
    </div>
  );
}
