import { Outlet, Link, useLocation } from 'react-router-dom';
import { useBasket } from './lib/BasketContext.jsx';
import { useAuth } from './lib/AuthContext.jsx';
import { api } from './lib/api.js';
import { useSettings } from './lib/SettingsContext.jsx';
import SurveyBanner from './components/SurveyBanner.jsx';
import { countdownLabel } from './lib/countdown.js';

function AvatarFallback() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export default function App() {
  const location = useLocation();
  const showFloater = !location.pathname.startsWith('/admin');
  const { account, basket, notifications } = useBasket();
  const { user, refresh: refreshAuth } = useAuth();

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
  const bannerOn = settings.banner_enabled === 'true' && (settings.banner_text || '').trim();
  const countdown = countdownLabel(settings.banner_countdown_date);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
      {user?.impersonating && (
        <div className="bg-amber-100 border-b border-amber-200">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-3 py-2 text-xs text-amber-900">
            <span>Viewing as <strong>{user.username}</strong> (signed in as {user.actual_username})</span>
            <button onClick={stopImpersonate} className="font-semibold underline">Stop</button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-3 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
            ) : null}
            <span className="truncate text-lg font-semibold tracking-tight">{shopName}</span>
          </Link>

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

            <Link
              to="/basket"
              className="block rounded-full p-0.5"
              aria-label="Basket"
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
            </Link>
          </div>
        </div>
      </header>
      {isHome && bannerOn && (
        <div style={{ background: settings.banner_bg_colour || '#0b8476', color: settings.banner_text_colour || '#ffffff' }}>
          <div className="mx-auto max-w-md px-3 py-1.5 text-center text-xs font-semibold tracking-wide">
            {countdown ? `${settings.banner_text} — ${countdown}` : settings.banner_text}
          </div>
        </div>
      )}
      {showFloater && <SurveyBanner />}
      <main className="mx-auto max-w-md px-4 pb-24 pt-4">
        <Outlet />
      </main>
    </div>
  );
}
