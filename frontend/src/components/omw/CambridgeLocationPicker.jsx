import { useRef, useState } from 'react';

/*
 * Location search bounded to Cambridge, UK — same approach as the scrolls
 * destination picker: Nominatim with the Cambridge viewbox + bounded=1, street
 * names only, plus a small curated list (e.g. Bishops Court) that OSM's bounded
 * street search doesn't surface.
 */

// Cambridge, UK bounding box (matches the scrolls composer).
const CAMBRIDGE_VIEWBOX = '0.02,52.27,0.25,52.12';

const CUSTOM_PLACES = [
  {
    label: 'Blinco Grove',
    query: 'Blinco Grove, Cambridge, UK',
    lat: 52.1893, lng: 0.1387,
    aliases: ['blinco', 'blinco grove'],
  },
  {
    label: 'Bishops Court',
    query: '49-54 Bishops Court, Cambridge, UK',
    lat: 52.2053, lng: 0.1192,
    aliases: ['bishop', 'bishops', "bishop's", 'bishops court', "bishop's court"],
  },
];

function customMatches(query) {
  const ql = query.trim().toLowerCase();
  if (!ql) return [];
  return CUSTOM_PLACES
    .filter((p) => p.label.toLowerCase().includes(ql) || p.aliases.some((a) => a.startsWith(ql)))
    .map((p) => ({ custom: true, label: p.label, query: p.query, lat: p.lat, lng: p.lng, place_id: `custom-${p.label}` }));
}

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none';

export default function CambridgeLocationPicker({ onPick, placeholder = 'Search a Cambridge street…' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  async function search(query) {
    if (!query.trim()) { setResults([]); return; }
    const customs = customMatches(query);
    setBusy(true);
    let streets = [];
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
        + `&limit=6&addressdetails=1&countrycodes=gb&viewbox=${CAMBRIDGE_VIEWBOX}&bounded=1`,
        { headers: { 'Accept-Language': 'en-GB' } },
      );
      const data = await res.json();
      const seen = new Set();
      for (const r of (Array.isArray(data) ? data : [])) {
        const road = r.address?.road || r.display_name?.split(',')[0].trim();
        if (!road || seen.has(road)) continue;
        seen.add(road);
        streets.push({ label: road, lat: Number(r.lat), lng: Number(r.lon), place_id: r.place_id });
      }
    } catch { /* fall back to customs only */ }
    const existing = new Set(streets.map((s) => s.label));
    setResults([...customs.filter((c) => !existing.has(c.label)), ...streets]);
    setBusy(false);
  }

  function onInput(e) {
    setQ(e.target.value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(e.target.value), 400);
  }

  async function choose(r) {
    let { lat, lng } = r;
    if (r.custom) {
      // Resolve precise coords for the curated address in the browser.
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(r.query)}&limit=1`,
          { headers: { 'Accept-Language': 'en-GB' } },
        );
        const d = await res.json();
        if (Array.isArray(d) && d[0]) { lat = Number(d[0].lat); lng = Number(d[0].lon); }
      } catch { /* keep fallback coords */ }
    }
    onPick({ label: r.label, lat, lng });
    setQ('');
    setResults([]);
  }

  return (
    <div className="relative">
      <input className={inputCls} value={q} onChange={onInput} placeholder={placeholder} />
      {busy && <span className="absolute right-2 top-2 text-[10px] text-neutral-400">…</span>}
      {results.length > 0 && (
        <ul className="absolute left-0 z-10 mt-1 max-h-44 w-full overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
