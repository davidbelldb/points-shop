import { useNavigate } from 'react-router-dom';
import { useToast } from '../lib/ToastContext.jsx';

// Renders the active in-app toasts as small tappable cards at the top of the
// screen. Tap → navigate to the toast's url; the ✕ dismisses without navigating.
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
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-neutral-900/95 px-4 py-3 text-left text-white shadow-2xl ring-1 ring-white/10 backdrop-blur transition active:scale-[0.98]"
          style={{ animation: 'sneakyToastIn 220ms ease-out' }}
        >
          <div className="min-w-0 flex-1">
            {t.title && <p className="truncate text-sm font-semibold">{t.title}</p>}
            {t.body && <p className="line-clamp-2 text-xs text-white/70">{t.body}</p>}
          </div>
          <span
            role="button"
            aria-label="Dismiss"
            onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
            className="-mr-1 -mt-0.5 shrink-0 px-1 text-lg leading-none text-white/50"
          >
            ✕
          </span>
        </button>
      ))}
    </div>
  );
}
