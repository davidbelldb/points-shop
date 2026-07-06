import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useBasket } from './lib/BasketContext.jsx';
import { useAuth } from './lib/AuthContext.jsx';
import { api } from './lib/api.js';
import { useSettings } from './lib/SettingsContext.jsx';
import { useTheme } from './lib/ThemeContext.jsx';
import SurveyBanner from './components/SurveyBanner.jsx';
import MenuDrawer from './components/MenuDrawer.jsx';
import SideNav from './components/SideNav.jsx';
import BasketDrawer from './components/BasketDrawer.jsx';
import IncomingCallBanner from './components/IncomingCallBanner.jsx';
import InAppNotifier from './components/InAppNotifier.jsx';
import WelcomeOverlay from './components/WelcomeOverlay.jsx';
import PullToRefresh from './components/PullToRefresh.jsx';
import SplashFireworks from './components/SplashFireworks.jsx';
import FloatingHead from './components/FloatingHead.jsx';
import PageTransition from './components/PageTransition.jsx';
import { countdownClock } from './lib/countdown.js';
import { hapticTap, hapticFireworks } from './lib/haptics.js';

// Fire a celebratory launch haptic exactly once per app session (module-level
// guard survives App re-mounts on route changes; native shell only).
let launchHapticDone = false;

function AvatarFallback() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

// Live DD:HH:MM:SS countdown clock — ticks every second, hides once the moment arrives.
function CountdownClock({ date, time }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = countdownClock(date, time);
  if (!clock) return null;
  return <span className="shrink-0 font-mono tabular-nums">{clock}</span>;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const showFloater = !location.pathname.startsWith('/admin');
  const { account, basket, notifications, badgeCount, refresh: refreshBasket } = useBasket();
  const { user, refresh: refreshAuth } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const headerRef = useRef(null);

  // Welcome flourish on cold launch — a short, punchy fireworks crackle.
  useEffect(() => {
    if (launchHapticDone || !Capacitor.isNativePlatform()) return;
    launchHapticDone = true;
    hapticFireworks();
  }, []);

  // Sync the theme from the currently-loaded account, so each user gets their own.
  useEffect(() => {
    if (account?.theme && account.theme !== theme) setTheme(account.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.theme]);

  async function stopImpersonate() {
    try { await api.admin.stopImpersonate(); await refreshAuth(); window.location.href = '/admin'; }
    catch (e) { console.error(e); }
  }
  const { settings } = useSettings();
  const points = account?.points_balance ?? 0;
  const itemCount = basket?.item_count ?? 0;
  const unreadCount = badgeCount ?? (notifications?.unread_count ?? 0);
  const shopName = settings.shop_name ?? 'Sneaky Points';
  const logoUrl  = settings.logo_url;

  const isHome = location.pathname === '/';
  // Floating partner head on the home page. Defaults: on for David (admin),
  // off for Katie (partner) until toggled on from the admin panel.
  const floatingHeadEnabled = isHome && (
    user?.role === 'admin'
      ? settings.floating_head_admin !== 'false'
      : settings.floating_head_partner === 'true'
  );
  const isGame = location.pathname.startsWith('/games/');
  const isFullGame = location.pathname === '/games/streets-of-cambs-rage';
  const isMessages = location.pathname.startsWith('/messages');
  const bannerOn = settings.banner_enabled === 'true' && (settings.banner_text || '').trim();

  // Hide the header on the game page when in landscape — gives edge-to-edge
  // canvas. Rotating back to portrait restores the header for navigation.
  // Only hide the header for phone-sized landscape (height ≤ 500px).
  // Tablets and desktops in landscape are always taller than this.
  const [isLandscape, setIsLandscape] = useState(
    () => window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
    const handler = (e) => setIsLandscape(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const hideHeader = isFullGame && isLandscape;

  // Publish the fixed header's height (incl. the safe-area inset it reserves)
  // as --app-header-h so the page content can be padded clear of it and the
  // modal sheets / drawers can sit BELOW the nav bar. Re-measured on resize /
  // orientation / header changes.
  useEffect(() => {
    const root = document.documentElement;
    // --app-vh = the height the PAGES actually fill. The pages stretch to
    // `-webkit-fill-available`, which on iOS (esp. the installed PWA) is TALLER
    // than window.innerHeight and than 100svh/dvh/lvh. We measure that exact
    // value with a throwaway probe so the drawers/sheets can be the same height
    // as every page — no guessing at viewport units.
    const setVh = () => {
      let h = window.innerHeight;
      try {
        const probe = document.createElement('div');
        probe.style.cssText =
          'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:-webkit-fill-available';
        document.body.appendChild(probe);
        const measured = probe.getBoundingClientRect().height;
        document.body.removeChild(probe);
        if (measured > 0) h = measured;
      } catch { /* ignore — fall back to innerHeight */ }
      root.style.setProperty('--app-vh', `${Math.round(h)}px`);
    };
    const el = headerRef.current;
    const set = () => {
      setVh();
      if (el) root.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
      else root.style.setProperty('--app-header-h', '0px');
    };
    set();
    const ro = el ? new ResizeObserver(set) : null;
    if (ro && el) ro.observe(el);
    window.addEventListener('orientationchange', set);
    window.addEventListener('resize', set);
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', set);
      window.removeEventListener('resize', set);
    };
  }, [hideHeader, user?.impersonating]);

  // Keep the fixed nav bar pinned to the top of the VISIBLE area ONLY while the
  // keyboard is open. On iOS the keyboard scrolls the visual viewport down to
  // reveal the focused field, which would push a fixed header out of view;
  // following visualViewport.offsetTop cancels that out.
  //
  // Crucially this is gated to "keyboard open". During ordinary scrolling the
  // visual viewport's offsetTop also wobbles (momentum / rubber-band), and
  // reacting to that was making the nav bar drift while scrolling. When the
  // keyboard is closed we force transform to none so the header is a pure
  // position:fixed bar that never moves, no matter how you scroll.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = headerRef.current;
    if (!vv || !el) return undefined;
    // In a standalone PWA the webview resizes for the keyboard, so the fixed
    // header already stays put — running the follow transform there just made
    // it drift. Only Safari (non-standalone) needs it.
    const isStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    // Installed PWAs resize the webview themselves, so the fixed header already
    // stays put there. The native shell uses Keyboard resize:none (the composer
    // is lifted manually for a smooth glide), so the header DOES need the
    // visualViewport-follow to stay pinned during keyboard scroll.
    if (isStandalone) { el.style.transform = ''; return undefined; }
    let raf = 0;
    let maxH = vv.height;
    const follow = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        maxH = Math.max(maxH, vv.height);
        const keyboardOpen = (maxH - vv.height) > 150;
        el.style.transform = (keyboardOpen && vv.offsetTop) ? `translateY(${vv.offsetTop}px)` : '';
      });
    };
    vv.addEventListener('resize', follow);
    vv.addEventListener('scroll', follow);
    follow();
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', follow);
      vv.removeEventListener('scroll', follow);
      el.style.transform = '';
    };
  }, [hideHeader]);

  // Native edge swipes: drag in from the LEFT screen edge → open the menu;
  // from the RIGHT edge → go to /account. Native shell only, so it doesn't
  // clash with the browser's own back/forward edge-swipe on the web.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const EDGE = 24, THRESH = 55, MAX_OFF_AXIS = 70, MAX_MS = 600;
    let x0 = 0, y0 = 0, t0 = 0, fromLeft = false, fromRight = false, tracking = false;
    const onStart = (e) => {
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
      fromLeft = x0 <= EDGE;
      fromRight = x0 >= window.innerWidth - EDGE;
      tracking = fromLeft || fromRight;
    };
    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 > MAX_MS || Math.abs(dy) > MAX_OFF_AXIS) return;
      if (fromLeft && dx > THRESH) setMenuOpen(true);
      else if (fromRight && dx < -THRESH) navigate('/account');
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [navigate]);

  // Refresh account/basket/notifications when the app returns to the foreground,
  // so reopening never shows stale points or a missed alert. Native only.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) refreshBasket?.();
    }).then((h) => { handle = h; }).catch(() => {});
    return () => { handle?.remove?.(); };
  }, [refreshBasket]);

  // Match the native status bar to the current theme (light text on the dark
  // theme, dark text on the light theme).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
  }, [theme]);

  // Home-screen Quick Actions: the native AppDelegate calls this to deep-link.
  useEffect(() => {
    window.sneakyQuickAction = (url) => { if (url) navigate(url); };
    return () => { window.sneakyQuickAction = undefined; };
  }, [navigate]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-neutral-50 text-neutral-900 antialiased">
      {/* Persistent sidebar — hidden on the full-screen game route so it
          doesn't appear when rotating to landscape on iPhone */}
      {!isFullGame && <SideNav />}

      {/* All page content shifts right by sidebar width on md+
          (not on the game route — no sidebar there) */}
      <div
        className={isFullGame ? 'flex flex-col h-screen' : 'md:pl-56'}
        style={isFullGame || hideHeader ? undefined : { paddingTop: 'var(--app-header-h, 56px)' }}
      >
      {!hideHeader && user?.impersonating && (
        <div className="bg-amber-100 border-b border-amber-200">
          <div className="mx-auto flex w-full items-center justify-between gap-2 px-3 py-2 text-xs text-amber-900 lg:px-6">
            <span>Viewing as <strong>{user.username}</strong> (signed in as {user.actual_username})</span>
            <button onClick={stopImpersonate} className="font-semibold underline">Stop</button>
          </div>
        </div>
      )}
      {!hideHeader && <header ref={headerRef} className="fixed top-0 left-0 right-0 md:left-56 z-50 border-b border-neutral-200 bg-white/80 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex w-full items-center justify-between gap-2 px-3 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {/* Hamburger — mobile only normally; always shown on game route (no SideNav there) */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 ${isFullGame ? '' : 'md:hidden'}`}
            >
              {/* transformBox:'view-box' makes transformOrigin relative to the SVG
                  viewport, not each line's own bounding box — fixes off-centre rotation. */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line
                  x1="3" y1="6" x2="21" y2="6"
                  style={{
                    transformBox: 'view-box',
                    transformOrigin: '50% 50%',
                    transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
                    transform: menuOpen ? 'translateY(6px) rotate(45deg)' : 'none',
                  }}
                />
                <line
                  x1="3" y1="12" x2="21" y2="12"
                  style={{
                    transformBox: 'view-box',
                    transformOrigin: '50% 50%',
                    transition: 'opacity 200ms ease, transform 300ms cubic-bezier(0.4,0,0.2,1)',
                    opacity: menuOpen ? 0 : 1,
                    transform: menuOpen ? 'scaleX(0)' : 'none',
                  }}
                />
                <line
                  x1="3" y1="18" x2="21" y2="18"
                  style={{
                    transformBox: 'view-box',
                    transformOrigin: '50% 50%',
                    transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
                    transform: menuOpen ? 'translateY(-6px) rotate(-45deg)' : 'none',
                  }}
                />
              </svg>
            </button>
            {/* Logo/name — hidden on md+ normally; always shown on game route (no SideNav there) */}
            <Link
              to="/"
              onClick={(e) => {
                hapticTap();
                // On the homepage, scroll back to the top instead of re-navigating;
                // from any other page, behave as a normal "home" link.
                if (location.pathname === '/') {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className={`flex min-w-0 items-center gap-2 ${isFullGame ? '' : 'md:hidden'}`}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
              ) : null}
              <span className="truncate text-lg font-semibold tracking-tight">{shopName}</span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/account"
              className="flex items-center gap-1.5 rounded-full bg-amber-100 py-1 pl-1 pr-2.5 text-sm font-semibold text-amber-900"
              aria-label="Account"
            >
              <span className="relative inline-block">
                <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-amber-200 text-amber-900">
                  {account?.photo_url ? (
                    <img src={account.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback />
                  )}
                </span>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold leading-none text-amber-900">
                    {unreadCount}
                  </span>
                )}
              </span>
              {points.toLocaleString()} pts
            </Link>

            <button
              onClick={() => setBasketOpen(true)}
              className="block rounded-full p-0.5"
              aria-label="Open basket"
            >
              <span className="relative inline-block">
                <img
                  src="/sphincter-pink.svg"
                  alt=""
                  className="block h-7 w-7 translate-y-0.5"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                {itemCount > 0 && (
                  <span className="absolute right-0 top-1/2 flex h-5 min-w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-amber-600 px-1 text-xs font-semibold text-amber-900">
                    {itemCount}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      </header>}
      {/* Nav drawer — mobile only */}
      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      {/* Basket drawer — all devices */}
      <BasketDrawer open={basketOpen} onClose={() => setBasketOpen(false)} />
      {/* Incoming SneakyTime call — rings on every page */}
      <IncomingCallBanner />
      {/* Polls for new alerts and raises in-app toasts (foreground only) */}
      <InAppNotifier />
      {/* One-time welcome (continues the splash); native pull-to-refresh */}
      <WelcomeOverlay />
      <SplashFireworks />
      <PullToRefresh />
      {floatingHeadEnabled && <FloatingHead />}
      {isHome && bannerOn && (() => {
        const bannerLink = (settings.banner_link_url || '').trim();
        const inner = (
          <div className="flex w-full items-center justify-center gap-2.5 px-3 py-1.5 text-xs font-semibold tracking-wide lg:px-6">
            <span className="truncate">{settings.banner_text}</span>
            <CountdownClock date={settings.banner_countdown_date} time={settings.banner_countdown_time} />
          </div>
        );
        return bannerLink ? (
          <a href={bannerLink} style={{ background: settings.banner_bg_colour || '#0b8476', color: settings.banner_text_colour || '#ffffff', display: 'block', textDecoration: 'none' }}>
            {inner}
          </a>
        ) : (
          <div style={{ background: settings.banner_bg_colour || '#0b8476', color: settings.banner_text_colour || '#ffffff' }}>
            {inner}
          </div>
        );
      })()}
      {showFloater && <SurveyBanner />}
      <main className={isFullGame ? 'flex-1 min-h-0 flex flex-col w-full overflow-hidden' : `px-4 pt-4 ${isGame ? 'w-full max-w-md md:max-w-none md:px-8 pb-8' : isMessages ? 'w-full pb-0 lg:px-8' : 'w-full pb-24 lg:px-8'}`}>
        <PageTransition />
      </main>
      </div>{/* end md:pl-56 wrapper */}
    </div>
  );
}
