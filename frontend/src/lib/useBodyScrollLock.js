import { useEffect } from 'react';

/* Lock background scrolling while a modal / drawer is open.

   We pin <body> with position:fixed at a negative top offset equal to the
   current scroll position. This freezes the page EXACTLY where it was — so the
   content visible behind a drawer's tinted backdrop stays put (an earlier
   overflow:hidden approach let iOS visually clamp the page to the top while the
   drawer was open, even though it was restored on close). The app header is
   position:fixed to the viewport with no transformed ancestor, so pinning the
   body does not move it.

   The touchmove handler still runs so a modal's own [data-modal-scroll] region
   keeps scrolling internally while the background is frozen.

   A shared counter supports stacked modals: locked on the first open, released
   on the last close. */

let lockCount = 0;
let savedScrollY = 0;

function isInsideScrollable(target) {
  let el = target;
  while (el && el !== document.body) {
    if (el.nodeType === 1 && el.hasAttribute('data-modal-scroll')) return true;
    el = el.parentElement;
  }
  return false;
}

function onTouchMove(e) {
  // Allow pinch-zoom and any gesture inside a designated scroll region.
  if (e.touches && e.touches.length > 1) return;
  if (isInsideScrollable(e.target)) return;
  e.preventDefault();
}

function applyLock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    // Freeze the page in place: pin body at -scrollY so the frozen content
    // shows the same position the user was at (visible behind a drawer's tint).
    const b = document.body.style;
    b.position = 'fixed';
    b.top = `-${savedScrollY}px`;
    b.left = '0';
    b.right = '0';
    b.width = '100%';
    b.overflow = 'hidden'; // desktop wheel
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  lockCount += 1;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    const b = document.body.style;
    b.position = '';
    b.top = '';
    b.left = '';
    b.right = '';
    b.width = '';
    b.overflow = '';
    document.removeEventListener('touchmove', onTouchMove, { passive: false });
    // Restore the exact scroll position the page was frozen at.
    window.scrollTo(0, savedScrollY);
  }
}

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    applyLock();
    return releaseLock;
  }, [active]);
}
