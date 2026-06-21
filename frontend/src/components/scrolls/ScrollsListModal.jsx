import { useEffect, useState } from 'react';
import { useTheme } from '../../lib/ThemeContext.jsx';
import ScrollReader from './ScrollReader.jsx';

function formatSent(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}

/* The "scrolls" pop-out — standard site modal chrome (rounded card over a dimmed
   page, light/dark). Tapping a scroll opens the full-size reader. */
export default function ScrollsListModal({ scrolls = [], settings = {}, onRead, onClose }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [openScroll, setOpenScroll] = useState(null);
  const font = `${settings.scroll_font || 'Cinzel'}, "UnifrakturMaguntia", "Cinzel Decorative", Georgia, serif`;

  const cardBg = isDark ? '#171717' : '#ffffff';
  const rowBg = isDark ? '#262626' : '#f5f5f5';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !openScroll) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, openScroll]);

  function open(s) {
    setOpenScroll(s);
    if (!s.read_at) onRead?.(s.id);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl p-6 shadow-2xl"
          style={{ background: cardBg }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: isDark ? '#fafafa' : '#171717' }}>Scrolls</h2>
            <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-600" aria-label="Close">×</button>
          </div>

          {scrolls.length === 0 && (
            <p className="rounded-xl px-4 py-6 text-center text-sm" style={{ background: rowBg, color: isDark ? '#a3a3a3' : '#737373' }}>
              No ravens have reached you yet.
            </p>
          )}

          <ul className="space-y-2">
            {scrolls.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => open(s)}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition active:scale-[0.99]"
                  style={{ background: rowBg }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                      <span>From {s.sender_name || s.sender_username || 'a friend'}</span>
                      {s.simulated && (
                        <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-600">Test</span>
                      )}
                      {!s.read_at && (
                        <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">New</span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-sm" style={{ color: isDark ? '#e5e5e5' : '#262626', fontFamily: font }}>
                      {s.body}
                    </p>
                    <p className="mt-0.5 text-[10px] text-neutral-400">{formatSent(s.sent_at)}</p>
                  </div>
                  <span className="shrink-0 text-neutral-400">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {openScroll && (
        <ScrollReader scroll={openScroll} settings={settings} onClose={() => setOpenScroll(null)} />
      )}
    </>
  );
}
