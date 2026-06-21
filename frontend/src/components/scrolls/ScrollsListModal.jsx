import { useEffect, useState } from 'react';
import { assetUrl } from './scrollAssets.js';

function formatSent(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}

/* The "scrolls" pop-out: every received scroll rendered on parchment in the
   olde font, stamped with its in-world sent date/time. Opening an unread scroll
   marks it read. */
export default function ScrollsListModal({ scrolls = [], settings = {}, onRead, onClose }) {
  const [openId, setOpenId] = useState(null);
  const font = `${settings.scroll_font || 'Cinzel'}, "UnifrakturMaguntia", "Cinzel Decorative", Georgia, serif`;
  const bgUrl = assetUrl(settings.scroll_bg_file);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(s) {
    setOpenId((cur) => (cur === s.id ? null : s.id));
    if (!s.read_at) onRead?.(s.id);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 py-10"
      style={{ background: 'rgba(20,12,4,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl text-amber-50" style={{ fontFamily: font }}>Scrolls</h2>
          <button onClick={onClose} className="text-2xl leading-none text-amber-50/80 hover:text-amber-50" aria-label="Close">×</button>
        </div>

        {scrolls.length === 0 && (
          <p className="rounded-xl bg-amber-50/90 px-4 py-6 text-center text-sm text-amber-900" style={{ fontFamily: font }}>
            No ravens have reached you yet.
          </p>
        )}

        <ul className="space-y-3">
          {scrolls.map((s) => {
            const isOpen = openId === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  className="block w-full overflow-hidden rounded-[12px] text-left shadow-lg transition active:scale-[0.99]"
                  style={{
                    backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    background: bgUrl ? undefined : 'linear-gradient(155deg, #f3e7c6 0%, #e8d39c 60%, #dcc488 100%)',
                    border: '1px solid rgba(90,60,20,0.4)',
                  }}
                >
                  <div className="px-5 py-4" style={{ fontFamily: font }}>
                    <div className="flex items-center justify-between text-[11px] text-amber-900/70">
                      <span>From {s.sender_name || s.sender_username || 'a friend'}</span>
                      {!s.read_at && (
                        <span className="rounded-full bg-red-800 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-50">
                          New
                        </span>
                      )}
                    </div>

                    <p
                      className={`mt-2 text-amber-950 ${isOpen ? '' : 'line-clamp-2'}`}
                      style={{ fontSize: '1.05rem', lineHeight: 1.5 }}
                    >
                      {s.body}
                    </p>

                    {isOpen && (
                      <div className="mt-3 border-t border-amber-900/25 pt-2 text-[11px] text-amber-900/70">
                        {(s.origin_label || s.dest_label) && (
                          <p>
                            {s.origin_label || 'parts unknown'}
                            {' → '}
                            {s.dest_label || 'parts unknown'}
                            {s.distance_km ? ` · ${Math.round(s.distance_km).toLocaleString()} km` : ''}
                          </p>
                        )}
                        <p className="mt-0.5 italic">Sent {formatSent(s.sent_at)}</p>
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
