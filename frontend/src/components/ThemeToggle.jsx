import { useTheme } from '../lib/ThemeContext.jsx';

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
          {isDark ? <SunIcon /> : <MoonIcon />}
        </span>
        {isDark ? 'Light mode' : 'Dark mode'}
      </span>
      <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${isDark ? 'bg-amber-500' : 'bg-neutral-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}
