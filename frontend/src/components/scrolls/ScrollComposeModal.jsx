import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl, haversineKm, flightSeconds, humanizeSeconds } from './scrollAssets.js';

// scroll_blank.png is 1360 x 1542.
const SCROLL_W = 1360;
const SCROLL_H = 1542;
const PARCHMENT_FALLBACK = 'linear-gradient(155deg, #f3e7c6 0%, #e8d39c 55%, #dcc488 100%)';
const DROPDOWN_BG = '#d2a469';

// Cambridge, UK bounding box for the destination lookup.
const CAMBRIDGE_VIEWBOX = '0.02,52.27,0.25,52.12';

// Message constraints: 20 chars per line, max 4 lines (=> 80 chars total).
const MAX_LINE = 20;
const MAX_LINES = 4;
const MAX_TOTAL = MAX_LINE * MAX_LINES;

/* Wrap raw input into at most MAX_LINES lines of at most MAX_LINE chars. A word
   that would overflow the current line moves to the next line, and each new line
   starts its 20-char count fresh (no carry-over). Words longer than 20 chars are
   hard-broken. Explicit newlines are honoured. Anything past 4 lines is dropped. */
function wrapMessage(input) {
  const src = String(input).replace(/\r\n?/g, '\n');
  // Preserve an in-progress trailing space so the user can actually type spaces
  // (re-wrapping on every keystroke would otherwise strip it instantly).
  const endsWithSpace = / $/.test(src);
  const segments = src.split('\n');
  const lines = [];
  for (let si = 0; si < segments.length && lines.length < MAX_LINES; si++) {
    const words = segments[si].split(' ');
    let cur = '';
    for (let wi = 0; wi < words.length && lines.length < MAX_LINES; wi++) {
      let w = words[wi];
      while (w.length > MAX_LINE && lines.length < MAX_LINES) {
        if (cur) { lines.push(cur); cur = ''; if (lines.length >= MAX_LINES) break; }
        lines.push(w.slice(0, MAX_LINE));
        w = w.slice(MAX_LINE);
      }
      if (lines.length >= MAX_LINES) break;
      if (w === '') continue;
      if (cur === '') cur = w;
      else if ((cur + ' ' + w).length <= MAX_LINE) cur += ' ' + w;
      else { lines.push(cur); cur = (lines.length < MAX_LINES) ? w : ''; }
    }
    if (cur !== '' && lines.length < MAX_LINES) lines.push(cur);
    else if (cur === '' && si < segments.length - 1 && lines.length < MAX_LINES && segments[si] === '') lines.push('');
  }
  let out = lines.slice(0, MAX_LINES).join('\n');
  if (endsWithSpace) {
    const parts = out.split('\n');
    const last = parts.length - 1;
    if (parts[last].length > 0 && parts[last].length < MAX_LINE) {
      parts[last] += ' ';
      out = parts.join('\n');
    }
  }
  return out;
}

/* Destination picker — Nominatim lookup limited to Cambridge, UK. Styled to sit
   on the parchment: ImperialBlack font, single centred field, dropdown in black
   on #d2a469. */
function DestinationPicker({ value, onPick, font }) {
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
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
        + `&limit=6&addressdetails=1&countrycodes=gb&viewbox=${CAMBRIDGE_VIEWBOX}&bounded=1`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const data = await res.json();
      // Street names only, de-duplicated.
      const seen = new Set();
      const streets = [];
      for (const r of (Array.isArray(data) ? data : [])) {
        const road = r.address?.road;
        if (!road || seen.has(road)) continue;
        seen.add(road);
        streets.push({ ...r, road });
      }
      setResults(streets);
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
    const lbl = r.road || r.display_name?.split(',')[0].trim() || r.display_name;
    onPick({ label: lbl, lat: Number(r.lat), lng: Number(r.lon) });
    setQ(lbl);
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative mx-auto w-[78%]">
      <input
        value={q}
        onChange={onInput}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Destination"
        style={{ background: 'transparent', border: 'none', fontFamily: font }}
        className="w-full px-3 py-1.5 text-center text-base text-black placeholder-black/50 focus:outline-none"
      />
      {busy && <span className="absolute right-2 top-2 text-[10px] text-black/40">…</span>}
      {open && results.length > 0 && (
        <ul
          className="absolute left-0 z-10 mt-1 max-h-44 w-full overflow-auto rounded-lg shadow-lg"
          style={{ background: DROPDOWN_BG, border: '1px solid rgba(90,60,20,0.45)' }}
        >
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="block w-full px-3 py-1.5 text-left text-sm text-black hover:bg-black/10"
                style={{ fontFamily: font }}
              >
                {r.road || r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Compose modal — the scroll_blank parchment is shown in full (no cropping) with
   content overlaid. Sender location is requested automatically; only the
   destination is chosen, centred. */
export default function ScrollComposeModal({ settings = {}, testMode = false, onSend, onSent, onClose }) {
  const [body, setBody] = useState('');
  const [origin, setOrigin] = useState(null); // auto from geolocation
  const [dest, setDest] = useState(null);
  const [stamping, setStamping] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sealBroken, setSealBroken] = useState(false);

  const font = `${settings.scroll_font || 'Cinzel'}, "UnifrakturMaguntia", "Cinzel Decorative", Georgia, serif`;
  const bgUrl = assetUrl(settings.scroll_bg_file);
  const sealOpen = assetUrl(settings.seal_open_file);
  const sealStamped = assetUrl(settings.seal_stamped_file);

  const flight = useMemo(() => {
    const km = haversineKm(origin?.lat, origin?.lng, dest?.lat, dest?.lng);
    return { km, secs: flightSeconds(km, settings) };
  }, [origin, dest, settings]);

  // Request the sender's location automatically (no field shown).
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const data = await res.json();
        const lbl = data.address?.road || data.display_name?.split(',')[0].trim() || 'your location';
        setOrigin({ label: lbl, lat: latitude, lng: longitude });
      } catch { setOrigin({ label: 'your location', lat: pos.coords.latitude, lng: pos.coords.longitude }); }
    }, () => { /* denied — origin stays unknown */ }, { timeout: 10000 });
  }, []);

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

  const previewText = origin && dest
    ? `≈ ${Math.round(flight.km).toLocaleString()} km · arrives in ${humanizeSeconds(flight.secs)}`
    : dest
      ? 'Allow location to time the crow’s journey.'
      : 'Choose a destination.';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3">
      <div className="relative">
        {/* Full scroll image (no crop). Fallback box if not yet supplied. */}
        {bgUrl ? (
          <img src={bgUrl} alt="" draggable={false} className="block max-h-[94vh] w-auto max-w-[94vw] select-none" />
        ) : (
          <div
            className="max-h-[94vh] max-w-[94vw] rounded-2xl"
            style={{ aspectRatio: `${SCROLL_W} / ${SCROLL_H}`, width: 420, background: PARCHMENT_FALLBACK }}
          />
        )}

        <button
          type="button"
          onClick={() => !sending && onClose()}
          className="absolute right-[7%] z-20 text-3xl leading-none text-black/70 hover:text-black"
          style={{ top: 'calc(5% + 2px)' }}
          aria-label="Close"
        >×</button>

        {/* Overlaid content, inset to the parchment's writable area. */}
        <div className="absolute inset-0 flex flex-col items-center text-center" style={{ padding: '5.5% 14% 7%' }}>
          <h2 className="text-2xl text-black" style={{ fontFamily: font, letterSpacing: '0.5px' }}>
            Send a Sneaky Scroll
          </h2>

          {/* gap so the message drops well inside the decorated frame */}
          <div style={{ height: '21%' }} />

          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(wrapMessage(e.target.value))}
            placeholder="Pen thy message…"
            rows={MAX_LINES}
            wrap="hard"
            className="w-full resize-none bg-transparent text-center text-xl leading-snug text-black placeholder-black/40 focus:outline-none"
            style={{ fontFamily: font, whiteSpace: 'pre-wrap' }}
          />
          <div className="w-full text-right text-[10px] text-black/50">{body.replace(/\n/g, '').length}/{MAX_TOTAL}</div>

          <div className="flex-1" />

          <DestinationPicker value={dest} onPick={setDest} font={font} />
          <div className="mt-1 text-center text-xs text-black/70" style={{ fontFamily: font }}>
            {previewText}
          </div>

          {error && <p className="mt-1 text-center text-xs text-red-700">{error}</p>}

          {/* Wax seal = send button */}
          <button
            type="button"
            onClick={fireSend}
            disabled={!body.trim() || sending}
            title="Seal & send"
            className="relative mt-2 flex h-20 w-20 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40"
          >
            <span
              className="relative flex h-20 w-20 items-center justify-center"
              style={{ animation: stamping ? 'scroll-seal-stamp 0.55s cubic-bezier(0.3,1.5,0.5,1) both' : undefined }}
            >
              {(() => {
                const url = stamping ? (sealStamped || sealOpen) : sealOpen;
                return url && !sealBroken
                  ? <img src={url} alt="wax seal" onError={() => setSealBroken(true)} className="h-20 w-20 object-contain" draggable={false} />
                  : <span className="h-16 w-16 rounded-full shadow-lg" style={{ background: 'radial-gradient(circle at 35% 30%, #b3402f, #7c1d12)' }} />;
              })()}
              <span
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-bold uppercase tracking-[0.15em]"
                style={{ color: '#ffffff', textShadow: '0 1px 3px rgba(60,15,5,0.7)', fontFamily: font }}
              >
                {sending ? '···' : 'SEAL'}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
