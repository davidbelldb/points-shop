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

  const destLine = (scroll.dest_label || scroll.distance_km)
    ? `${scroll.dest_label || 'parts unknown'}${scroll.distance_km ? ` · ${Math.round(scroll.distance_km).toLocaleString()} km` : ''}`
    : null;

  // Mirror the composer: longer messages render at (roughly) half size so up to
  // 200 characters still fit inside the parchment frame.
  const bodyLen = (scroll.body || '').replace(/\n/g, '').length;
  const bodyFontSize = bodyLen > 70
    ? 'clamp(1.0rem, 3.2vw, 1.6rem)'
    : 'clamp(1.3rem, 4.5vw, 2.2rem)';

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

        {/* Origin address + sent date — both at the top of the scroll roll */}
        <div className="absolute inset-x-0 text-center" style={{ top: '5.5%', fontFamily: font }}>
          {scroll.origin_label && (
            <p className="text-[11px] italic text-black/60">from {scroll.origin_label}</p>
          )}
          <p className="text-[11px] italic text-black/55">Sent {formatSent(scroll.sent_at)}</p>
        </div>

        {/* Message centred in the frame; destination + distance beneath (footer) */}
        <div
          className="absolute inset-x-0 flex flex-col items-center text-center"
          style={{ top: '20%', bottom: '24%', paddingLeft: '15%', paddingRight: '15%' }}
        >
          <div className="flex flex-1 flex-col items-center justify-center">
            <p
              className="text-black"
              style={{ fontFamily: font, fontSize: bodyFontSize, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
            >
              {scroll.body}
            </p>
          </div>
          {destLine && (
            <p className="mt-2 text-[11px] leading-tight text-black/70" style={{ fontFamily: font, marginBottom: '1.6rem' }}>to {destLine}</p>
          )}
        </div>

        {/* CLOSE — stamped wax seal */}
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="absolute left-1/2 flex h-[91px] w-[91px] -translate-x-1/2 items-center justify-center rounded-full transition active:scale-95"
          style={{ bottom: 'calc(15% - 35px)' }}
        >
          {sealStamped && !sealBroken
            ? <img src={sealStamped} alt="" onError={() => setSealBroken(true)} className="h-[91px] w-[91px] object-contain" draggable={false} />
            : <span className="h-[76px] w-[76px] rounded-full shadow-lg" style={{ background: 'radial-gradient(circle at 35% 30%, #b3402f, #7c1d12)' }} />}
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold tracking-[0.04em]"
            style={{ color: '#ffffff', textShadow: '0 1px 3px rgba(60,15,5,0.7)', fontFamily: font }}
          >
            Close
          </span>
        </button>
      </div>
    </div>
  );
}
