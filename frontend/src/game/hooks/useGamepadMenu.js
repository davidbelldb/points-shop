/**
 * useGamepadMenu
 *
 * Polls the first connected gamepad each animation frame and fires
 * callbacks on edge events (press only, not hold).  Safe to call in
 * any menu screen — the RAF stops on unmount.
 *
 * Buttons:
 *   A / Cross     (0)  → onConfirm
 *   B / Circle    (1)  → onBack
 *   D-pad left   (14)  → onLeft
 *   D-pad right  (15)  → onRight
 *   D-pad up     (12)  → onUp
 *   D-pad down   (13)  → onDown
 *   Start/+/Menu  (9)  → onStart  (falls back to onConfirm if omitted)
 *
 * Left stick also fires onLeft/onRight/onUp/onDown.
 *
 * Callbacks are stored in a ref so you never need to restart the effect
 * when they change identity — pass plain inline functions freely.
 */

import { useEffect, useRef } from 'react';

const DEADZONE = 0.28;

export function useGamepadMenu({
  onLeft, onRight, onUp, onDown, onConfirm, onBack, onStart,
} = {}) {
  const cb = useRef({});
  cb.current = { onLeft, onRight, onUp, onDown, onConfirm, onBack, onStart };

  useEffect(() => {
    let raf;
    const prev = {};

    // Seed prev with whatever is already held so buttons carried over from
    // the previous screen don't fire as fresh presses on the first tick.
    const gp0 = [...(navigator.getGamepads?.() ?? [])].filter(Boolean)[0];
    if (gp0) {
      prev.left    = gp0.buttons[14]?.pressed || (gp0.axes[0] ?? 0) < -DEADZONE;
      prev.right   = gp0.buttons[15]?.pressed || (gp0.axes[0] ?? 0) >  DEADZONE;
      prev.up      = gp0.buttons[12]?.pressed || (gp0.axes[1] ?? 0) < -DEADZONE;
      prev.down    = gp0.buttons[13]?.pressed || (gp0.axes[1] ?? 0) >  DEADZONE;
      prev.confirm = gp0.buttons[0]?.pressed;
      prev.back    = gp0.buttons[1]?.pressed;
      prev.start   = gp0.buttons[9]?.pressed;
    }

    const tick = () => {
      const gp = [...(navigator.getGamepads?.() ?? [])].filter(Boolean)[0];
      if (gp) {
        const left    = gp.buttons[14]?.pressed || (gp.axes[0] ?? 0) < -DEADZONE;
        const right   = gp.buttons[15]?.pressed || (gp.axes[0] ?? 0) >  DEADZONE;
        const up      = gp.buttons[12]?.pressed || (gp.axes[1] ?? 0) < -DEADZONE;
        const down    = gp.buttons[13]?.pressed || (gp.axes[1] ?? 0) >  DEADZONE;
        const confirm = gp.buttons[0]?.pressed;
        const back    = gp.buttons[1]?.pressed;
        const start   = gp.buttons[9]?.pressed;

        if (left    && !prev.left)    cb.current.onLeft?.();
        if (right   && !prev.right)   cb.current.onRight?.();
        if (up      && !prev.up)      cb.current.onUp?.();
        if (down    && !prev.down)    cb.current.onDown?.();
        if (confirm && !prev.confirm) cb.current.onConfirm?.();
        if (back    && !prev.back)    cb.current.onBack?.();
        if (start   && !prev.start) {
          if (cb.current.onStart) cb.current.onStart();
          else cb.current.onConfirm?.();
        }

        prev.left = left; prev.right = right; prev.up = up; prev.down = down;
        prev.confirm = confirm; prev.back = back; prev.start = start;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // stable — callbacks accessed via ref, no restart needed
}
