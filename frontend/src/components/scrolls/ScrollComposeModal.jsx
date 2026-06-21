import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl, haversineKm, flightSeconds, humanizeSeconds } from './scrollAssets.js';

/* Reusable place picker — typed search + Nominatim autocomplete, mirroring the
   stories location sticker. Origin also offers a GPS snap. */
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
    const label = r.display_name?.split(',').slice(0, 2).join(',').trim() || r.display_name;
    onPick({ label, lat: Number(r.lat), lng: Number(r.lon) });
    setQ(label);
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
      const label = data.display_name?.split(',').slice(0, 2).join(',').trim() || 'My location';
      onPick({ label, lat: latitude, lng: longitude });
      setQ(label);
    } catch { /* denied / unavailable */ }
    finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/70">{label}</span>
        {allowGps && (
          <button type="button" onClick={snapGps} className="text-[10px] text-amber-800 underline">
            use my location
          </button>
        )}
      </div>
      <input
        value={q}
        onChange={onInput}
        onFocus={() => results.length && setOpen(true)}
        placeholder={value?.label || 'Search a place…'}
        className="mt-0.5 w-full rounded-lg border border-amber-900/30 bg-amber-50/70 px-2.5 py-1.5 text-sm text-amber-950 placeholder-amber-900/40 focus:outline-none focus:ring-1 focus:ring-amber-700"
      />
      {busy && <span className="absolute right-2 top-7 text-[10px] text-amber-900/50">…</span>}
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-amber-900/30 bg-amber-50 shadow-lg">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="block w-full px-2.5 py-1.5 text-left text-xs text-amber-950 hover:bg-amber-200/60"
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

/* The compose modal: a blank-scroll background with an olde-font message, an
   origin + destination for the flight-time sim, and a wax-seal stamp that
   doubles as the send button (stamp animation -> send -> parent flies the crow). */
export default function ScrollComposeModal({ settings = {}, onSend, onSent, onClose }) {
  const [body, setBody] = useState('');
  const [origin, setOrigin] = useState(null);
  const [dest, setDest] = useState(null);
  const [stamping, setStamping] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const maxChars = Number(settings.max_chars) || 280;
  const font = `${settings.scroll_font || 'Cinzel'}, "UnifrakturMaguntia", "Cinzel Decorative", Georgia, serif`;
  const bgUrl = assetUrl(settings.scroll_bg_file);
  const sealOpen = assetUrl(settings.seal_open_file);
  const sealStamped = assetUrl(settings.seal_stamped_file);
  const [sealBroken, setSealBroken] = useState(false);

  const flight = useMemo(() => {
    const km = haversineKm(origin?.lat, origin?.lng, dest?.lat, dest?.lng);
    return { km, secs: flightSeconds(km, settings) };
  }, [origin, dest, settings]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  async function fireSend() {
    if (!body.trim() || sending) return;
    setError(null);
    setStamping(true);
    // Let the wax stamp land before the request.
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
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(20,12,4,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={() => !sending && onClose()}
    >
      <div
        className="relative w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scroll surface */}
        <div
          className="relative overflow-hidden rounded-[14px] px-6 py-7 shadow-2xl"
          style={{
            backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            background: bgUrl
              ? undefined
              : 'linear-gradient(155deg, #f3e7c6 0%, #e8d39c 55%, #dcc488 100%)',
            border: '1px solid rgba(90,60,20,0.45)',
            minHeight: 340,
          }}
        >
          <button
            type="button"
            onClick={() => !sending && onClose()}
            className="absolute right-3 top-2 text-2xl leading-none text-amber-950/60 hover:text-amber-950"
            aria-label="Close"
          >×</button>

          <h2
            className="mb-3 text-center text-2xl text-amber-950"
            style={{ fontFamily: font, letterSpacing: '0.5px' }}
          >
            A Scroll by Raven
          </h2>

          <textarea
            autoFocus
            value={body}
            maxLength={maxChars}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Pen thy message…"
            rows={5}
            className="w-full resize-none bg-transparent text-center text-lg leading-relaxed text-amber-950 placeholder-amber-900/40 focus:outline-none"
            style={{ fontFamily: font }}
          />
          <div className="mb-3 text-right text-[10px] text-amber-900/60">{body.length}/{maxChars}</div>

          <div className="grid grid-cols-2 gap-3">
            <PlacePicker label="From" value={origin} onPick={setOrigin} allowGps />
            <PlacePicker label="To" value={dest} onPick={setDest} />
          </div>

          {/* Flight preview */}
          <div className="mt-3 text-center text-[11px] text-amber-900/70" style={{ fontFamily: font }}>
            {origin && dest
              ? `≈ ${Math.round(flight.km).toLocaleString()} km — thy crow shall arrive in ${humanizeSeconds(flight.secs)}`
              : 'Set a from & to, and the crow’s journey will be timed.'}
          </div>

          {error && <p className="mt-2 text-center text-xs text-red-800">{error}</p>}

          {/* Wax seal = send button */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={fireSend}
              disabled={!body.trim() || sending}
              title="Seal & send"
              className="relative flex h-20 w-20 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40"
              style={{ transformOrigin: 'center' }}
            >
              {(() => {
                const url = stamping ? (sealStamped || sealOpen) : sealOpen;
                if (url && !sealBroken) {
                  return (
                    <img
                      src={url}
                      alt="wax seal"
                      onError={() => setSealBroken(true)}
                      className="h-20 w-20 object-contain"
                      style={{ animation: stamping ? 'scroll-seal-stamp 0.55s cubic-bezier(0.3,1.5,0.5,1) both' : undefined }}
                      draggable={false}
                    />
                  );
                }
                // Placeholder seal until art lands.
                return (
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-full text-[10px] font-bold uppercase tracking-wide text-amber-50 shadow-lg"
                    style={{
                      background: 'radial-gradient(circle at 35% 30%, #b3402f, #7c1d12)',
                      animation: stamping ? 'scroll-seal-stamp 0.55s cubic-bezier(0.3,1.5,0.5,1) both' : undefined,
                    }}
                  >
                    {sending ? '···' : 'Seal'}
                  </span>
                );
              })()}
            </button>
          </div>
          <p className="mt-1 text-center text-[10px] text-amber-900/60" style={{ fontFamily: font }}>
            {sending ? 'Dispatching the raven…' : 'Press the seal to send'}
          </p>
        </div>
      </div>
    </div>
  );
}
