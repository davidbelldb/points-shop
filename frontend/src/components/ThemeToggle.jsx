import { useTheme } from '../lib/ThemeContext.jsx';
import { api } from '../lib/api.js';

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
export default function ThemeToggle({ iconColor }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  async function onClick() {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    try { await api.updateAccount({ theme: next }); } catch { /* ignore — local still applies */ }
  }

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
      aria-pressed={isDark}
    >
      <span className="flex items-center gap-3">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-100"
          style={{ color: iconColor || '#525252' }}
        >
          {/* Icon + label stay fixed regardless of mode — the only thing
              that flips is the switch on the right (on in dark, off in light). */}
          <MoonIcon />
        </span>
        Dark mode
      </span>
      <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${isDark ? 'bg-amber-500' : 'bg-neutral-300'}`}>
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
          style={{ transform: isDark ? 'translateX(18px)' : 'translateX(2px)' }}
        />
      </span>
    </button>
  );
}
