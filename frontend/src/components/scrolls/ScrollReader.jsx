import { useEffect } from 'react';
import { assetUrl } from './scrollAssets.js';

const SCROLL_W = 1360;
const SCROLL_H = 1542;
const PARCHMENT_FALLBACK = 'linear-gradient(155deg, #f3e7c6 0%, #e8d39c 55%, #dcc488 100%)';

function formatSent(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}

/* Full-size scroll reader — the opened scroll shown big on the parchment sprite
   (rendered as a real <img> so the whole scroll shows, no cropping). Used from
   the list and directly when tapping the landed crow. */
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {bgUrl ? (
          <img src={bgUrl} alt="" draggable={false} className="block max-h-[94vh] w-auto max-w-[94vw] select-none" />
        ) : (
          <div
            className="rounded-2xl"
            style={{ aspectRatio: `${SCROLL_W} / ${SCROLL_H}`, width: 'min(94vw, 460px)', background: PARCHMENT_FALLBACK }}
          />
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-[7%] top-[5%] text-3xl leading-none text-black/70 hover:text-black"
          aria-label="Close"
        >×</button>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ padding: '17% 15%' }}>
          <p className="mb-5 text-xs uppercase tracking-[0.2em] text-black/60">
            From {scroll.sender_name || scroll.sender_username || 'a friend'}
            {scroll.simulated ? ' · test' : ''}
          </p>
          <p
            className="text-black"
            style={{ fontFamily: font, fontSize: 'clamp(1.3rem, 4.5vw, 2.2rem)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
          >
            {scroll.body}
          </p>
          <div className="mt-6 text-[11px] text-black/60" style={{ fontFamily: font }}>
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
