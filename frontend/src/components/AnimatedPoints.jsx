import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useMotionValue, animate, useReducedMotion } from 'framer-motion';
import { spring } from '../lib/motion.js';
import { hapticSuccess } from '../lib/haptics.js';

// ── AnimatedPoints ───────────────────────────────────────────────────────────
// The points balance is the app's core currency, so a change should be *felt*.
// On increase the number rolls up with a spring, gives a quick scale-pop, and
// fires a success haptic. Decreases (spends) roll down quietly with no pop.
// Renders "1,234 pts". Honours reduced motion (snaps to the value, no pop).
//
// Usage: <AnimatedPoints value={points} className="…" />

export default function AnimatedPoints({ value = 0, suffix = ' pts', className }) {
  const reduce = useReducedMotion();
  const prev = useRef(value);
  const mounted = useRef(false);
  const [display, setDisplay] = useState(value);

  // Spring-driven counter. Soft, slightly slow so the roll-up reads clearly.
  const count = useSpring(value, { stiffness: 90, damping: 22, mass: 1 });
  // Scale used for the increase "pop".
  const scale = useMotionValue(1);

  useEffect(() => {
    if (reduce) { count.jump(value); setDisplay(value); }
    else if (!mounted.current) { count.jump(value); } // no roll-up on first paint
    else { count.set(value); }
    mounted.current = true;
  }, [value, reduce, count]);

  useEffect(() => {
    const unsub = count.on('change', (v) => setDisplay(Math.round(v)));
    return unsub;
  }, [count]);

  useEffect(() => {
    const went = value - prev.current;
    prev.current = value;
    if (went > 0 && mounted.current) {
      hapticSuccess();
      if (!reduce) animate(scale, [1, 1.18, 1], { duration: 0.42, ease: 'easeOut' });
    }
  }, [value, reduce, scale]);

  return (
    <motion.span
      className={className}
      style={{ scale, display: 'inline-block', transformOrigin: 'center' }}
    >
      {display.toLocaleString()}{suffix}
    </motion.span>
  );
}
