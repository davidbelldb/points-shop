import { useEffect, useState } from 'react';
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
   (rendered as a real <img> so the whole scroll shows). Closed via the stamped
   wax-seal CLOSE button at the bottom. */
export default function ScrollReader({ scroll, settings = {}, onClose }) {
  const font = `${settings.scroll_font || 'Cinzel'}, "UnifrakturMaguntia", "Cinzel Decorative", Georgia, serif`;
  const bgUrl = assetUrl(settings.scroll_bg_file);
  const sealStamped = assetUrl(settings.seal_stamped_file);
  const [sealBroken, setSealBroken] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!scroll) return null;

  const route = (scroll.origin_label || scroll.dest_label)
    ? `${scroll.origin_label || 'parts unknown'} → ${scroll.dest_label || 'parts unknown'}`
      + (scroll.distance_km ? ` · ${Math.round(scroll.distance_km).toLocaleString()} km` : '')
    : null;

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

        {/* Main content: From + message centred in the frame, route line beneath. */}
        <div
          className="absolute inset-x-0 flex flex-col items-center text-center"
          style={{ top: '15%', bottom: '24%', paddingLeft: '15%', paddingRight: '15%' }}
        >
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="mb-4 text-xs uppercase tracking-[0.2em] text-black/60">
              From {scroll.sender_name || scroll.sender_username || 'a friend'}
              {scroll.simulated ? ' · test' : ''}
            </p>
            <p
              className="text-black"
              style={{ fontFamily: font, fontSize: 'clamp(1.3rem, 4.5vw, 2.2rem)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
            >
              {scroll.body}
            </p>
          </div>
          {route && (
            <p className="mt-2 text-[11px] leading-tight text-black/70" style={{ fontFamily: font }}>{route}</p>
          )}
        </div>

        {/* CLOSE — stamped wax seal */}
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="absolute left-1/2 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full transition active:scale-95"
          style={{ bottom: '15%' }}
        >
          {sealStamped && !sealBroken
            ? <img src={sealStamped} alt="" onError={() => setSealBroken(true)} className="h-16 w-16 object-contain" draggable={false} />
            : <span className="h-14 w-14 rounded-full shadow-lg" style={{ background: 'radial-gradient(circle at 35% 30%, #b3402f, #7c1d12)' }} />}
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: '#ffffff', textShadow: '0 1px 3px rgba(60,15,5,0.7)', fontFamily: font }}
          >
            Close
          </span>
        </button>

        {/* Sent date — dropped onto the bottom rolled area */}
        <p
          className="absolute inset-x-0 text-center text-[11px] italic text-black/60"
          style={{ bottom: '6%', fontFamily: font }}
        >
          Sent {formatSent(scroll.sent_at)}
        </p>
      </div>
    </div>
  );
}
