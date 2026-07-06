import { useLocation, useNavigationType, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, pageVariants, useReducedMotion } from '../lib/motion.js';

// ── PageTransition ───────────────────────────────────────────────────────────
// Direction-aware iOS-style route transition, rendered in place of <Outlet/>.
// PUSH (forward) slides the incoming page in from the right and fades up; POP
// (back) mirrors it. Personality is deliberately subtle — a small offset plus
// opacity, no full-width horizontal slide — so window scrolling and
// position:sticky inside pages keep working untouched.
//
// PILOT ROLLOUT: only the routes below animate. Every other route renders
// plainly, so the transition can be validated on Home → Product → Basket before
// being taken app-wide. Reduced-motion users get a plain cross-fade.

const PILOT = [
  /^\/$/, // Home
  /^\/product\/[^/]+$/, // Product detail
  /^\/basket$/, // Basket
];
const inPilot = (path) => PILOT.some((re) => re.test(path));

export default function PageTransition() {
  const location = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'POP' | 'REPLACE'
  const outlet = useOutlet();
  const reduce = useReducedMotion();

  // Non-pilot routes are untouched during the pilot.
  if (!inPilot(location.pathname)) return outlet;

  const dir = navType === 'POP' ? -1 : 1;

  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div
        key={location.pathname}
        custom={dir}
        variants={reduce ? undefined : pageVariants}
        initial={reduce ? { opacity: 0 } : 'initial'}
        animate={reduce ? { opacity: 1 } : 'animate'}
        exit={reduce ? { opacity: 0 } : 'exit'}
        transition={spring.gentle}
        style={{ willChange: 'transform, opacity' }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
