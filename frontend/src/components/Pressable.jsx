import { useMemo, forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { spring, pressScale } from '../lib/motion.js';
import { hapticTap } from '../lib/haptics.js';

// ── Pressable ────────────────────────────────────────────────────────────────
// The default tappable element across the app. Gives every button/link an
// iOS-native press response: a quick scale-down on touch (snappy spring) paired
// with a light haptic. Honours prefers-reduced-motion (no scale) and never
// fires feedback when disabled.
//
// Usage:
//   <Pressable onClick={fn}>Tap me</Pressable>                // <button>
//   <Pressable as={Link} to="/basket">Basket</Pressable>     // react-router Link
//   <Pressable as="div" haptic={false}>…</Pressable>
//
// `as` accepts a tag name string ('button' | 'a' | 'div' | …) or a component
// (e.g. react-router's Link). Extra props pass straight through.

const motionCache = new Map();

function resolveMotion(as) {
  if (typeof as === 'string') return motion[as] || motion.button;
  // Component (e.g. Link) — wrap once and cache so identity stays stable.
  if (!motionCache.has(as)) {
    const create = motion.create || motion; // v11 prefers motion.create
    motionCache.set(as, create(as));
  }
  return motionCache.get(as);
}

const Pressable = forwardRef(function Pressable(
  { as = 'button', haptic = true, disabled = false, onClick, whileTap, transition, children, ...rest },
  ref,
) {
  const reduce = useReducedMotion();
  const Comp = useMemo(() => resolveMotion(as), [as]);

  const handleClick = (e) => {
    if (disabled) return;
    if (haptic) hapticTap();
    onClick?.(e);
  };

  // Buttons get the disabled attribute; other elements get aria-disabled.
  const disabledProps = as === 'button' ? { disabled } : disabled ? { 'aria-disabled': true } : {};

  return (
    <Comp
      ref={ref}
      onClick={handleClick}
      whileTap={reduce || disabled ? undefined : (whileTap ?? { scale: pressScale })}
      transition={transition ?? spring.snappy}
      {...disabledProps}
      {...rest}
    >
      {children}
    </Comp>
  );
});

export default Pressable;
