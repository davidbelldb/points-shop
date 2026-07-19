import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/* Scroll manager for client-side navigation.
 *
 * React Router (BrowserRouter + <Routes>) doesn't manage scroll at all, so we
 * do it here:
 *   - Forward navigation (PUSH / REPLACE) → jump to the top of the new page.
 *   - Back / forward (POP) → restore the scroll offset the page had when you
 *     left it, so returning to a long list (stories feed, messages, orders)
 *     drops you back where you were instead of at the top.
 *
 * We remember offsets per history entry via `location.key` (unique per entry,
 * so the same URL visited twice keeps separate positions). Because many routes
 * are lazy and their content grows in after mount, a single scrollTo often
 * lands short — so on POP we re-apply the target across a few animation frames
 * until the document is tall enough to honour it (or we give up). Runs in a
 * layout effect so it happens before paint — no visible jump.
 */
const positions = new Map();

export default function ScrollToTop() {
  const { key } = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'REPLACE' | 'POP'

  // Continuously record the current entry's scroll offset (rAF-throttled).
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => positions.set(key, window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [key]);

  useLayoutEffect(() => {
    if (navType === 'POP') {
      const target = positions.get(key) ?? 0;
      if (target === 0) { window.scrollTo(0, 0); return; }
      let tries = 0;
      const restore = () => {
        window.scrollTo(0, target);
        // Content may still be laying out (lazy chunk, images) — retry until we
        // can actually reach the offset, or run out of frames (~0.5s).
        if (tries++ < 30 && Math.abs(window.scrollY - target) > 1) {
          requestAnimationFrame(restore);
        }
      };
      restore();
    } else {
      window.scrollTo(0, 0);
    }
    // key changes on every navigation; navType tells us how we got here.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
