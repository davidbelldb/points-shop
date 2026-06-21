import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../lib/ThemeContext.jsx';
import { assetUrl, haversineKm, flightSeconds, humanizeSeconds } from './scrollAssets.js';

/* Reusable place picker — typed search + Nominatim autocomplete, mirroring the
   stories location sticker. Styled to sit on the standard modal card. */
function PlacePicker({ label, value, onPick, allowGps, isDark }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  const inputStyle = {
    background: isDark ? '#1f1f1f' : '#ffffff',
    border: `1px solid ${isDark ? '#3a3a3a' : '#e5e5e5'}`,
    color: isDark ? '#fafafa' : '#171717',
  };

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
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
        {allowGps && (
          <button type="button" onClick={snapGps} className="text-[10px] text-[#3aa88b] underline">
            use my location
          </button>
        )}
      </div>
      <input
        value={q}
        onChange={onInput}
        onFocus={() => results.length && setOpen(true)}
        placeholder={value?.label || 'Search a place…'}
        style={inputStyle}
        className="mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-sm placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#61dbbb]"
      />
      {busy && <span className="absolute right-2 top-7 text-[10px] text-neutral-400">…</span>}
      {open && results.length > 0 && (
        <ul
          className="absolute z-10 mt-1 max-h-44 w-full overflow-auto rounded-lg shadow-lg"
          style={{ background: isDark ? '#1f1f1f' : '#ffffff', border: `1px solid ${isDark ? '#3a3a3a' : '#e5e5e5'}` }}
        >
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-neutral-500/10"
                style={{ color: isDark ? '#e5e5e5' : '#404040' }}
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

/* Compose modal — wrapped in the site's standard modal chrome (rounded card over
   a dimmed page, light/dark aware). The scroll background sprite is used as the
   parchment writing surface inside the card. */
export default function ScrollComposeModal({ settings = {}, testMode = false, onSend, onSent, onClose }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

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

  const cardBg = isDark ? '#171717' : '#ffffff';
  const boxBg = isDark ? '#262626' : '#f5f5f5';

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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-6 shadow-2xl"
        style={{ background: cardBg }}
      >
        <div className="mb-1 flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Send a scroll</p>
          <button
            type="button"
            onClick={() => !sending && onClose()}
            className="-mt-1 text-2xl leading-none text-neutral-400 hover:text-neutral-600"
            aria-label="Close"
          >×</button>
        </div>

        {testMode && (
          <p className="mb-3 rounded-md bg-amber-500/15 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            Test mode · this scroll flies back to you only
          </p>
        )}

        {/* Parchment writing surface */}
        <div
          className="relative overflow-hidden rounded-2xl px-5 py-5"
          style={{
            backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            background: bgUrl ? undefined : 'linear-gradient(155deg, #f3e7c6 0%, #e8d39c 55%, #dcc488 100%)',
            border: '1px solid rgba(90,60,20,0.35)',
            minHeight: 200,
          }}
        >
          <h2 className="mb-2 text-center text-2xl text-amber-950" style={{ fontFamily: font, letterSpacing: '0.5px' }}>
            A Scroll by Raven
          </h2>
          <textarea
            autoFocus
            value={body}
            maxLength={maxChars}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Pen thy message…"
            rows={4}
            className="w-full resize-none bg-transparent text-center text-lg leading-relaxed text-amber-950 placeholder-amber-900/40 focus:outline-none"
            style={{ fontFamily: font }}
          />
          <div className="text-right text-[10px] text-amber-900/60">{body.length}/{maxChars}</div>
        </div>

        {/* Controls on the standard card */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PlacePicker label="From" value={origin} onPick={setOrigin} allowGps isDark={isDark} />
          <PlacePicker label="To" value={dest} onPick={setDest} isDark={isDark} />
        </div>

        <div className="mt-3 rounded-xl px-4 py-2.5 text-center text-xs" style={{ background: boxBg, color: isDark ? '#d4d4d4' : '#404040' }}>
          {origin && dest
            ? `≈ ${Math.round(flight.km).toLocaleString()} km · thy crow shall arrive in ${humanizeSeconds(flight.secs)}`
            : 'Set a from & to, and the crow’s journey will be timed.'}
        </div>

        {error && <p className="mt-2 text-center text-xs text-red-500">{error}</p>}

        {/* Wax seal = send button */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={fireSend}
            disabled={!body.trim() || sending}
            title="Seal & send"
            className="relative flex h-20 w-20 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40"
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
        <p className="mt-1 text-center text-[10px] text-neutral-500">
          {sending ? 'Dispatching the raven…' : 'Press the seal to send'}
        </p>
      </div>
    </div>
  );
}
