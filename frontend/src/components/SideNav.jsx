import { Link, useLocation } from 'react-router-dom';
import { useSettings } from '../lib/SettingsContext.jsx';
import { useBasket } from '../lib/BasketContext.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const ICON_COLOUR = '#ed70bd';

/* ── Icons (same as MenuDrawer) ─────────────────────────────────────────── */
function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function GameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="11" x2="10" y2="11" /><line x1="8" y1="9" x2="8" y2="13" />
      <line x1="15" y1="12" x2="15.01" y2="12" /><line x1="18" y1="10" x2="18.01" y2="10" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258a4 4 0 0 0-3.995-3.742" />
    </svg>
  );
}
function TvIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><polyline points="17 21 12 17 7 21" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function FeedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

/* ── Single nav item ─────────────────────────────────────────────────────── */
function NavItem({ to, label, icon }) {
  const location = useLocation();
  const active = to === '/'
    ? location.pathname === '/'
    : location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-amber-100 text-amber-900'
          : 'text-neutral-800 hover:bg-neutral-100'
      }`}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100"
        style={{ color: ICON_COLOUR }}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}

/* ── Persistent sidebar — hidden on mobile, shown on md+ ────────────────── */
export default function SideNav() {
  const { settings } = useSettings();
  const { notifications } = useBasket();
  const logoUrl  = settings.logo_url;
  const shopName = settings.shop_name ?? 'Sneaky Points';
  const unread   = notifications?.unread_count ?? 0;

  return (
    <aside className="hidden md:flex fixed left-0 top-0 z-20 h-screen w-56 flex-col border-r border-neutral-200 bg-white">

      {/* Brand header */}
      <Link
        to="/"
        className="flex items-center gap-2.5 border-b border-neutral-200 px-4 py-4 hover:bg-neutral-50 transition-colors"
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </span>
        )}
        <span className="truncate text-sm font-semibold tracking-tight">{shopName}</span>
      </Link>

      {/* Nav links */}
      <nav className="flex flex-1 flex-col overflow-y-auto p-2 pt-3">
        <div className="space-y-0.5">
          <NavItem to="/"         label="Home"       icon={<HomeIcon />} />
          <NavItem to="/stories"  label="Stories"    icon={<FeedIcon />} />
          <NavItem to="/games"    label="Games"      icon={<GameIcon />} />
          <NavItem to="/rewatch"  label="Watch list" icon={<TvIcon />} />
          <NavItem to="/calendar" label="Calendar"   icon={<CalendarIcon />} />
          <NavItem to="/messages" label="Chat"       icon={<ChatIcon />} />
        </div>

        {/* Account at bottom of nav */}
        <div className="mt-auto pt-2 space-y-0.5">
          <Link
            to="/account"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              window.location.pathname === '/account'
                ? 'bg-amber-100 text-amber-900'
                : 'text-neutral-800 hover:bg-neutral-100'
            }`}
          >
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100" style={{ color: ICON_COLOUR }}>
              <UserIcon />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-600 text-[9px] font-bold text-white px-0.5">
                  {unread}
                </span>
              )}
            </span>
            Account
          </Link>
        </div>
      </nav>

      {/* Theme toggle */}
      <div className="border-t border-neutral-200 p-2">
        <ThemeToggle />
      </div>
    </aside>
  );
}
