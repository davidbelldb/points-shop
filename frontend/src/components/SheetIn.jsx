import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';

// ── SheetIn ──────────────────────────────────────────────────────────────────
// Presents a route by sliding it up from the bottom of the screen, iOS-sheet
// style — but ONLY when navigation arrives with { state: { sheet: true } } (e.g.
// tapping the floating chat head). Any other entry to the route renders plainly.
//
// Once the slide finishes we drop the motion wrapper entirely and render the
// children bare. That's deliberate: a lingering `transform` on an ancestor
// creates a containing block that would re-anchor the page's position:fixed
// overlays (chat composer, story viewer). Removing it after the animation keeps
// those working normally.

export default function SheetIn({ children }) {
  const location = useLocation();
  const reduce = useReducedMotion();
  // Skip the animation (render plainly) unless we arrived via a sheet nav, or if
  // the user prefers reduced motion.
  const [done, setDone] = useState(() => !location.state?.sheet || reduce);

  if (done) return children;

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 38, mass: 0.9 }}
      onAnimationComplete={() => setDone(true)}
      style={{ willChange: 'transform' }}
    >
      {children}
    </motion.div>
  );
}
