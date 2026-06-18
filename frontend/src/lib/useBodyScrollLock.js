import { useEffect } from 'react';

/* Lock background scrolling while a modal / drawer is open.

   On iOS, `overflow:hidden` on <body> does NOT stop touch-scrolling the page
   behind a fixed overlay — the page kept scrolling under the calendar editor,
   visible as a moving scrollbar. The reliable fix is to pin <body> with
   position:fixed (preserving the scroll position via a negative top offset) and
   restore it on close.

   A shared counter supports nested/stacked modals: the lock is applied when the
   first one opens and only released when the last one closes. */

let lockCount = 0;
let savedScrollY = 0;

function applyLock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.overflow = '';
    // Restore the scroll position the page had before it was locked.
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
