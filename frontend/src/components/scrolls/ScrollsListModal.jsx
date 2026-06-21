import { useEffect, useState } from 'react';
import { useTheme } from '../../lib/ThemeContext.jsx';
import ScrollReader from './ScrollReader.jsx';
import { assetUrl } from './scrollAssets.js';

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
  const closedUrl = assetUrl(settings.scroll_closed_file || 'scroll_closed_1.png');
  const sealUrl = assetUrl(settings.seal_stamped_file);

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
          className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl p-6 shadow-2xl"
          style={{ background: cardBg }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex shrink-0 items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: isDark ? '#fafafa' : '#171717' }}>Scrolls</h2>
            <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-600" aria-label="Close">×</button>
          </div>

          {scrolls.length === 0 && (
            <p className="rounded-xl px-4 py-6 text-center text-sm" style={{ background: rowBg, color: isDark ? '#a3a3a3' : '#737373' }}>
              No ravens have reached you yet.
            </p>
          )}

          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {scrolls.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => open(s)}
                  className="relative block w-full transition active:scale-[0.99]"
                >
                  {/* Closed-scroll graphic */}
                  {closedUrl
                    ? <img src={closedUrl} alt="" draggable={false} className="block w-full select-none" />
                    : <div className="h-20 rounded-xl" style={{ background: rowBg }} />}

                  {/* Sender + date overlaid on the scroll (kept clear of the seal) */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center text-center"
                    style={{ paddingLeft: '8%', paddingRight: '24%', fontFamily: font }}
                  >
                    <span className="text-sm font-semibold text-black/80">
                      From {s.sender_name || s.sender_username || 'a friend'}
                    </span>
                    <span className="text-[11px] text-black/60">{formatSent(s.sent_at)}</span>
                  </div>

                  {/* OPEN wax seal on the right */}
                  <span className="absolute right-[4%] top-1/2 flex h-16 w-16 -translate-y-1/2 items-center justify-center">
                    {sealUrl
                      ? <img src={sealUrl} alt="" draggable={false} className="h-16 w-16 object-contain" />
                      : <span className="h-14 w-14 rounded-full shadow" style={{ background: 'radial-gradient(circle at 35% 30%, #b3402f, #7c1d12)' }} />}
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-bold tracking-wide"
                      style={{ color: '#ffffff', textShadow: '0 1px 3px rgba(60,15,5,0.7)', fontFamily: font }}
                    >
                      Open
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {openScroll && (
        <ScrollReader
          scroll={openScroll}
          settings={settings}
          onClose={() => {
            // Reading deletes the scroll. If none remain, close straight to chat;
            // otherwise return to the (now shorter) list.
            if (scrolls.length === 0) onClose();
            else setOpenScroll(null);
          }}
        />
      )}
    </>
  );
}
