import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/* Resets scroll on navigation.
 *
 * React Router (BrowserRouter + <Routes>) does NOT reset the scroll position
 * when the route changes — it keeps whatever offset the previous page had.
 * That's why opening a page (e.g. Dirty Wordle) after scrolling down another
 * one loaded it "half scrolled", hiding the title / scores / back link until a
 * manual refresh reset things.
 *
 * We scroll to the top on forward navigation (PUSH) and on replaced routes
 * (REPLACE), but deliberately leave POP (browser back/forward, iOS edge swipe)
 * alone so the platform's own scroll restoration can return you to where you
 * were in a list. useLayoutEffect runs before paint, so there's no visible
 * jump. Lazy routes still land at the top: content mounts under the already-
 * reset scroll position.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'REPLACE' | 'POP'

  useLayoutEffect(() => {
    if (navType === 'POP') return;
    window.scrollTo(0, 0);
  }, [pathname, navType]);

  return null;
}
