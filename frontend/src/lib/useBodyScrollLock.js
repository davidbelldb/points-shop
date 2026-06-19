import { useEffect } from 'react';

/* Lock background scrolling while a modal / drawer is open — WITHOUT moving the
   document.

   An earlier version pinned <body> with position:fixed. That reliably stops
   scrolling, but it also yanks the sticky app header off-screen, which is the
   opposite of what we want: the nav bar must stay visible above the modal.

   Instead we:
   1. set overflow:hidden on <html>/<body> (handles desktop wheel + keeps the
      sticky header exactly where it is), and
   2. swallow touchmove on iOS — where overflow:hidden alone is ignored — for
      every touch EXCEPT those inside an element marked [data-modal-scroll]
      (the modal's own scroll region), so the modal still scrolls internally.

   A shared counter supports stacked modals: locked on the first open, released
   on the last close. */

let lockCount = 0;

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
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  lockCount += 1;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.removeEventListener('touchmove', onTouchMove, { passive: false });
  }
}

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    applyLock();
    return releaseLock;
  }, [active]);
}
