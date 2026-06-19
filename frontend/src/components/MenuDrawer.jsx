import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle.jsx';
import { useBodyScrollLock } from '../lib/useBodyScrollLock.js';

const ICON_COLOUR = '#ed70bd';

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
      <line x1="6" y1="11" x2="10" y2="11" />
      <line x1="8" y1="9" x2="8" y2="13" />
      <line x1="15" y1="12" x2="15.01" y2="12" />
      <line x1="18" y1="10" x2="18.01" y2="10" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258a4 4 0 0 0-3.995-3.742" />
    </svg>
  );
}
function TvIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <polyline points="17 21 12 17 7 21" />
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
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}
function NotesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
function SheetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
function VideoCallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
function Item({ to, label, icon, onClose }) {
  const location = useLocation();
  const active = to === '/'
    ? location.pathname === '/'
    : location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      onClick={onClose}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
        active ? 'bg-amber-100 text-amber-900' : 'text-neutral-800 hover:bg-neutral-100'
      }`}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-100" style={{ color: ICON_COLOUR }}>
        {icon}
      </span>
      {label}
    </Link>
  );
}

const SWIPE_LEFT_THRESHOLD = 60;

export default function MenuDrawer({ open, onClose }) {
  useBodyScrollLock(open);
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Left-swipe anywhere on the drawer closes it.
  useEffect(() => {
    if (!open) return undefined;
    let startX = null;
    function onTouchStart(e) { startX = e.touches?.[0]?.clientX ?? null; }
    function onTouchEnd(e) {
      if (startX == null) return;
      const endX = e.changedTouches?.[0]?.clientX ?? null;
      if (endX != null && startX - endX > SWIPE_LEFT_THRESHOLD) onClose();
      startX = null;
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [open, onClose]);

  // Drawer slides out BELOW the sticky nav bar so the nav remains visible.
  // Header is `py-3` (24px) around a 32px content row + 1px border ≈ 57px.
  return (
    <div
      className={`fixed left-0 right-0 z-[45] ${open ? '' : 'pointer-events-none'}`}
      style={{ top: 'var(--app-header-h)', height: 'calc(100dvh - var(--app-header-h))' }}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Scrollable nav list — grows to fill, scrolls when the items are
            taller than the drawer. */}
        <nav data-modal-scroll className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-2 pt-3">
          <Item to="/" label="Sneaky Home" icon={<HomeIcon />} onClose={onClose} />
          <Item to="/store" label="Sneaky Store" icon={<StoreIcon />} onClose={onClose} />
          <Item to="/notes" label="Sneaky Notes" icon={<NotesIcon />} onClose={onClose} />
          <Item to="/stories" label="Sneaky Stories" icon={<FeedIcon />} onClose={onClose} />
          <Item to="/games" label="Sneaky Games" icon={<GameIcon />} onClose={onClose} />
          <Item to="/rewatch" label="Sneaky Watchlist" icon={<TvIcon />} onClose={onClose} />
          <Item to="/calendar" label="Sneaky Calendar" icon={<CalendarIcon />} onClose={onClose} />
          <Item to="/messages" label="Sneaky Chat" icon={<ChatIcon />} onClose={onClose} />
          <Item to="/sneakytime" label="Sneaky Time" icon={<VideoCallIcon />} onClose={onClose} />
          <Item to="/sneakyspreadsheets" label="Sneaky Sheets" icon={<SheetIcon />} onClose={onClose} />
        </nav>
        {/* Pinned footer — always anchored to the bottom of the visible drawer. */}
        <div className="shrink-0 border-t border-neutral-200 p-2 space-y-1">
          <Item to="/account" label="Sneaky Account" icon={<UserIcon />} onClose={onClose} />
          <ThemeToggle iconColor={ICON_COLOUR} />
        </div>
      </aside>
    </div>
  );
}
