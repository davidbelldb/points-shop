import { useEffect } from 'react';
import { assetUrl } from './scrollAssets.js';

function formatSent(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}

/* Full-size scroll reader — the opened scroll shown big on the parchment sprite.
   Used both from the scrolls list and directly when tapping the landed crow.
   (First pass; will be refined to David's wireframes.) */
export default function ScrollReader({ scroll, settings = {}, onClose }) {
  const font = `${settings.scroll_font || 'Cinzel'}, "UnifrakturMaguntia", "Cinzel Decorative", Georgia, serif`;
  const bgUrl = assetUrl(settings.scroll_bg_file);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!scroll) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-[91] text-3xl leading-none text-white/80 hover:text-white"
        aria-label="Close"
      >×</button>
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          background: bgUrl ? undefined : 'linear-gradient(155deg, #f3e7c6 0%, #e8d39c 55%, #dcc488 100%)',
          minHeight: '60vh',
        }}
      >
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center" style={{ fontFamily: font }}>
          <p className="mb-6 text-sm uppercase tracking-[0.2em] text-amber-900/70">
            From {scroll.sender_name || scroll.sender_username || 'a friend'}
            {scroll.simulated ? ' · test' : ''}
          </p>
          <p className="text-amber-950" style={{ fontSize: 'clamp(1.4rem, 4.5vw, 2.4rem)', lineHeight: 1.5 }}>
            {scroll.body}
          </p>
          <div className="mt-8 text-xs text-amber-900/70">
            {(scroll.origin_label || scroll.dest_label) && (
              <p>
                {scroll.origin_label || 'parts unknown'} → {scroll.dest_label || 'parts unknown'}
                {scroll.distance_km ? ` · ${Math.round(scroll.distance_km).toLocaleString()} km` : ''}
              </p>
            )}
            <p className="mt-1 italic">Sent {formatSent(scroll.sent_at)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
