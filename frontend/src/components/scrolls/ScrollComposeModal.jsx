import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl, haversineKm, flightSeconds, humanizeSeconds } from './scrollAssets.js';

const PARCHMENT_FALLBACK = 'linear-gradient(155deg, #f3e7c6 0%, #e8d39c 55%, #dcc488 100%)';

function surfaceStyle(bgUrl) {
  return bgUrl
    ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: PARCHMENT_FALLBACK };
}

/* Place picker — typed search + Nominatim autocomplete, styled to sit on the
   parchment surface (translucent white inputs, black text). */
function PlacePicker({ label, value, onPick, allowGps }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  async function search(query) {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    setBusy(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setOpen(true);
    } catch { setResults([]); }
    finally { setBusy(false); }
  }

  function onInput(e) {
    const v = e.target.value;
    setQ(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 400);
  }

  function choose(r) {
    const lbl = r.display_name?.split(',').slice(0, 2).join(',').trim() || r.display_name;
    onPick({ label: lbl, lat: Number(r.lat), lng: Number(r.lon) });
    setQ(lbl);
    setResults([]);
    setOpen(false);
  }

  async function snapGps() {
    if (!navigator.geolocation) return;
    setBusy(true);
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }));
      const { latitude, longitude } = pos.coords;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const data = await res.json();
      const lbl = data.display_name?.split(',').slice(0, 2).join(',').trim() || 'My location';
      onPick({ label: lbl, lat: latitude, lng: longitude });
      setQ(lbl);
    } catch { /* denied / unavailable */ }
    finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-black/60">{label}</span>
        {allowGps && (
          <button type="button" onClick={snapGps} className="text-[10px] text-black/70 underline">
            use my location
          </button>
        )}
      </div>
      <input
        value={q}
        onChange={onInput}
        onFocus={() => results.length && setOpen(true)}
        placeholder={value?.label || 'Search a place…'}
        className="mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-sm text-black placeholder-black/40 focus:outline-none focus:ring-1 focus:ring-black/40"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(90,60,20,0.35)' }}
      />
      {busy && <span className="absolute right-2 top-7 text-[10px] text-black/40">…</span>}
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-44 w-full overflow-auto rounded-lg bg-white shadow-lg" style={{ border: '1px solid rgba(90,60,20,0.35)' }}>
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="block w-full px-2.5 py-1.5 text-left text-xs text-black hover:bg-black/5"
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Compose modal — the scroll_blank parchment IS the modal surface (rounded card
   over a dimmed page), matching the reader. Message in the scroll font, black
   for legibility. Closes only via the explicit ✕ or Escape. */
export default function ScrollComposeModal({ settings = {}, testMode = false, onSend, onSent, onClose }) {
  const [body, setBody] = useState('');
  const [origin, setOrigin] = useState(null);
  const [dest, setDest] = useState(null);
  const [stamping, setStamping] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sealBroken, setSealBroken] = useState(false);

  const maxChars = Number(settings.max_chars) || 280;
  const font = `${settings.scroll_font || 'Cinzel'}, "UnifrakturMaguntia", "Cinzel Decorative", Georgia, serif`;
  const bgUrl = assetUrl(settings.scroll_bg_file);
  const sealOpen = assetUrl(settings.seal_open_file);
  const sealStamped = assetUrl(settings.seal_stamped_file);

  const flight = useMemo(() => {
    const km = haversineKm(origin?.lat, origin?.lng, dest?.lat, dest?.lng);
    return { km, secs: flightSeconds(km, settings) };
  }, [origin, dest, settings]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  async function fireSend() {
    if (!body.trim() || sending) return;
    setError(null);
    setStamping(true);
    await new Promise((r) => setTimeout(r, 650));
    setSending(true);
    try {
      const scroll = await onSend({
        body: body.trim(),
        origin: origin ? { label: origin.label, lat: origin.lat, lng: origin.lng } : {},
        dest: dest ? { label: dest.label, lat: dest.lat, lng: dest.lng } : {},
      });
      onSent?.(scroll);
    } catch (err) {
      setError(err.message || 'The raven refused to fly. Try again.');
      setStamping(false);
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl px-6 py-6 shadow-2xl"
        style={{ ...surfaceStyle(bgUrl), border: '1px solid rgba(90,60,20,0.4)' }}
      >
        <button
          type="button"
          onClick={() => !sending && onClose()}
          className="absolute right-3 top-2 text-3xl leading-none text-black/60 hover:text-black"
          aria-label="Close"
        >×</button>

        <h2 className="mb-1 text-center text-2xl text-black" style={{ fontFamily: font, letterSpacing: '0.5px' }}>
          A Scroll by Raven
        </h2>

        {testMode && (
          <p className="mx-auto mb-2 w-fit rounded-md bg-black/10 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-black/70">
            Test · flies back to you only
          </p>
        )}

        <textarea
          autoFocus
          value={body}
          maxLength={maxChars}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Pen thy message…"
          rows={5}
          className="w-full resize-none bg-transparent text-center text-xl leading-relaxed text-black placeholder-black/40 focus:outline-none"
          style={{ fontFamily: font }}
        />
        <div className="mb-3 text-right text-[10px] text-black/50">{body.length}/{maxChars}</div>

        <div className="grid grid-cols-2 gap-3">
          <PlacePicker label="From" value={origin} onPick={setOrigin} allowGps />
          <PlacePicker label="To" value={dest} onPick={setDest} />
        </div>

        <div className="mt-3 text-center text-xs text-black/70" style={{ fontFamily: font }}>
          {origin && dest
            ? `≈ ${Math.round(flight.km).toLocaleString()} km · thy crow shall arrive in ${humanizeSeconds(flight.secs)}`
            : 'Set a from & to, and the crow’s journey will be timed.'}
        </div>

        {error && <p className="mt-2 text-center text-xs text-red-700">{error}</p>}

        {/* Wax seal = send button */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={fireSend}
            disabled={!body.trim() || sending}
            title="Seal & send"
            className="relative flex h-24 w-24 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40"
          >
            <span
              className="relative flex h-24 w-24 items-center justify-center"
              style={{ animation: stamping ? 'scroll-seal-stamp 0.55s cubic-bezier(0.3,1.5,0.5,1) both' : undefined }}
            >
              {(() => {
                const url = stamping ? (sealStamped || sealOpen) : sealOpen;
                return url && !sealBroken
                  ? <img src={url} alt="wax seal" onError={() => setSealBroken(true)} className="h-24 w-24 object-contain" draggable={false} />
                  : <span className="h-20 w-20 rounded-full shadow-lg" style={{ background: 'radial-gradient(circle at 35% 30%, #b3402f, #7c1d12)' }} />;
              })()}
              {/* SEAL label over the sprite */}
              <span
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-bold uppercase tracking-[0.15em]"
                style={{ color: '#ffffff', textShadow: '0 1px 3px rgba(60,15,5,0.7)', fontFamily: font }}
              >
                {sending ? '···' : 'SEAL'}
              </span>
            </span>
          </button>
        </div>
        <p className="mt-1 text-center text-[10px] text-black/60" style={{ fontFamily: font }}>
          {sending ? 'Dispatching the raven…' : 'Press the seal to send'}
        </p>
      </div>
    </div>
  );
}
