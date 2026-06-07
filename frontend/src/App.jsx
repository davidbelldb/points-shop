import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useBasket } from './lib/BasketContext.jsx';
import { useAuth } from './lib/AuthContext.jsx';
import { api } from './lib/api.js';
import { useSettings } from './lib/SettingsContext.jsx';
import { useTheme } from './lib/ThemeContext.jsx';
import SurveyBanner from './components/SurveyBanner.jsx';
import MenuDrawer from './components/MenuDrawer.jsx';
import SideNav from './components/SideNav.jsx';
import BasketDrawer from './components/BasketDrawer.jsx';
import { countdownClock } from './lib/countdown.js';

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
  const showFloater = !location.pathname.startsWith('/admin');
  const { account, basket, notifications } = useBasket();
  const { user, refresh: refreshAuth } = useAuth();
  const { theme, setTheme } = useTheme();
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);

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
  const unreadCount = notifications?.unread_count ?? 0;
  const shopName = settings.shop_name ?? 'Sneaky Points';
  const logoUrl  = settings.logo_url;

  const isHome = location.pathname === '/';
  const isGame = location.pathname.startsWith('/games/');
  const isFullGame = location.pathname === '/games/streets-of-cambs-rage';
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

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
      {/* Persistent sidebar — hidden on the full-screen game route so it
          doesn't appear when rotating to landscape on iPhone */}
      {!isFullGame && <SideNav />}

      {/* All page content shifts right by sidebar width on md+
          (not on the game route — no sidebar there) */}
      <div className={isFullGame ? 'flex flex-col h-screen' : 'md:pl-56'}>
      {!hideHeader && user?.impersonating && (
        <div className="bg-amber-100 border-b border-amber-200">
          <div className="mx-auto flex w-full items-center justify-between gap-2 px-3 py-2 text-xs text-amber-900 lg:px-6">
            <span>Viewing as <strong>{user.username}</strong> (signed in as {user.actual_username})</span>
            <button onClick={stopImpersonate} className="font-semibold underline">Stop</button>
          </div>
        </div>
      )}
      {!hideHeader && <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-2 px-3 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {/* Hamburger — mobile only; sidebar handles nav on md+ */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 md:hidden"
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
            {/* Logo/name — hidden on md+ because sidebar carries branding */}
            <Link to="/" className="flex min-w-0 items-center gap-2 md:hidden">
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
      {isHome && bannerOn && (
        <div style={{ background: settings.banner_bg_colour || '#0b8476', color: settings.banner_text_colour || '#ffffff' }}>
          <div className="flex w-full items-center justify-center gap-2.5 px-3 py-1.5 text-xs font-semibold tracking-wide lg:px-6">
            <span className="truncate">{settings.banner_text}</span>
            <CountdownClock date={settings.banner_countdown_date} time={settings.banner_countdown_time} />
          </div>
        </div>
      )}
      {showFloater && <SurveyBanner />}
      <main className={isFullGame ? 'flex-1 min-h-0 flex flex-col w-full overflow-hidden' : `px-4 pt-4 ${isGame ? 'w-full max-w-md md:max-w-none md:px-8 pb-24 md:pb-8' : 'w-full pb-24 lg:px-8'}`}>
        <Outlet />
      </main>
      </div>{/* end md:pl-56 wrapper */}
    </div>
  );
}
