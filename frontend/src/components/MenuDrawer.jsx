import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle.jsx';

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
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function Item({ to, label, icon, onClose }) {
  return (
    <Link
      to={to}
      onClick={onClose}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">{icon}</span>
      {label}
    </Link>
  );
}

export default function MenuDrawer({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <span className="text-base font-semibold">Menu</span>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100" aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          <Item to="/" label="Sneaky Home" icon={<HomeIcon />} onClose={onClose} />
          <Item to="/games" label="Sneaky Games" icon={<GameIcon />} onClose={onClose} />
          <Item to="/rewatch" label="Sneaky Watchlist" icon={<TvIcon />} onClose={onClose} />
          <Item to="/messages" label="Sneaky Chat" icon={<ChatIcon />} onClose={onClose} />
          <Item to="/account" label="Sneaky Account" icon={<UserIcon />} onClose={onClose} />
        </nav>
        <div className="border-t border-neutral-200 p-2">
          <ThemeToggle />
        </div>
      </aside>
    </div>
  );
}
