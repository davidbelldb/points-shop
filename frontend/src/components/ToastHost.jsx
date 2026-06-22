import { useNavigate } from 'react-router-dom';
import { useToast } from '../lib/ToastContext.jsx';

// Renders the active in-app toasts as small tappable cards at the top of the
// screen. Tap → navigate to the toast's url; the ✕ dismisses without navigating.
// Branded plum (#a04d89) with white text, and the sender's avatar.
export default function ToastHost() {
  const { toasts, dismiss } = useToast();
  const navigate = useNavigate();
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-3"
      style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <style>{'@keyframes sneakyToastIn{from{transform:translateY(-130%);opacity:0}to{transform:translateY(0);opacity:1}}'}</style>
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => { if (t.url) navigate(t.url); dismiss(t.id); }}
          className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-3.5 py-3 text-left shadow-2xl ring-1 ring-white/15 transition active:scale-[0.98]"
          style={{ animation: 'sneakyToastIn 220ms ease-out', background: '#12302a', color: '#ffffff' }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/25 text-sm font-bold text-white">
            {t.avatar
              ? <img src={t.avatar} alt="" className="h-full w-full object-cover" />
              : (t.title?.trim()?.[0]?.toUpperCase() ?? '✦')}
          </span>
          <div className="min-w-0 flex-1">
            {t.title && <p className="truncate text-sm font-semibold text-white">{t.title}</p>}
            {t.body && <p className="line-clamp-2 text-xs text-white/85">{t.body}</p>}
          </div>
          <span
            role="button"
            aria-label="Dismiss"
            onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
            className="-mr-0.5 shrink-0 self-start px-1 text-lg leading-none text-white/70"
          >
            ✕
          </span>
        </button>
      ))}
    </div>
  );
}
