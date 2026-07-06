// ── iOS-native motion tokens ─────────────────────────────────────────────────
// Single source of truth for animation feel across the app. Personality:
// "subtle & fast" — Apple-system-app restraint. Tight, quick springs with
// minimal overshoot; navigation stays understated, only celebrations get a
// little life. Everything is designed to degrade to a cross-fade under
// prefers-reduced-motion (see the CSS block in index.css and, in JS, the
// re-exported useReducedMotion below).
//
// These are framer-motion `transition` objects — pass them straight to a
// motion component's `transition` prop, e.g. <motion.div transition={spring.snappy} />.

export { useReducedMotion } from 'framer-motion';

/** Spring presets. Higher stiffness + high damping = fast settle, little bounce. */
export const spring = {
  // Buttons / taps — near-instant settle, no visible bounce.
  snappy: { type: 'spring', stiffness: 520, damping: 36, mass: 0.7 },
  // Sheets / page pushes — smooth, controlled glide.
  gentle: { type: 'spring', stiffness: 340, damping: 36, mass: 0.9 },
  // Celebrations / wins — a restrained touch of overshoot.
  bouncy: { type: 'spring', stiffness: 440, damping: 24, mass: 0.8 },
};

/** The iOS sheet/ease curve, for CSS-only or tween-based cases. */
export const easeIOS = [0.32, 0.72, 0, 1];

/** Tween durations (seconds) for the "subtle & fast" personality. */
export const duration = {
  fast: 0.2,
  base: 0.28,
  slow: 0.4,
};

/** Standard press-down scale for tappable elements. */
export const pressScale = 0.96;

/**
 * Direction-aware page transition variants (subtle iOS push/pop). Forward
 * navigation slides the incoming page in from the right a touch and fades up;
 * back navigation mirrors it. Kept small on purpose — no full-width horizontal
 * slide, which keeps window-scroll and position:sticky behaviour intact.
 *
 * `custom` is the direction: 1 = forward (push), -1 = back (pop).
 */
export const pageVariants = {
  initial: (dir) => ({ opacity: 0, x: dir * 24, scale: 0.99 }),
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: (dir) => ({ opacity: 0, x: dir * -24, scale: 0.99 }),
};
