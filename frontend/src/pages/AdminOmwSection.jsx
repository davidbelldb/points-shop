import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

/* Compact location search — same Nominatim source as the scroll composer /
   forecast admin. */
function LocationPicker({ onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  async function search(query) {
    if (!query.trim()) { setResults([]); return; }
    setBusy(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
        + '&limit=6&addressdetails=1&countrycodes=gb',
        { headers: { 'Accept-Language': 'en-GB' } },
      );
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    setBusy(false);
  }

  function onInput(e) {
    setQ(e.target.value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(e.target.value), 400);
  }

  function choose(r) {
    const label = r.address?.road || r.display_name?.split(',')[0].trim() || r.display_name;
    onPick({ label, lat: Number(r.lat), lng: Number(r.lon) });
    setQ('');
    setResults([]);
  }

  return (
    <div className="relative">
      <input className={inputCls} value={q} onChange={onInput} placeholder="Search a destination…" />
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
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminOmwSection({ bare = false }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedId, setSavedId] = useState(null);

  async function load() {
    try { setRows((await api.omw.listDestinations()).destinations); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(accountId, dest) {
    setBusy(true); setError(null);
    try {
      await api.omw.setDestination(accountId, dest);
      setRows((prev) => prev.map((r) => (r.account_id === accountId ? { ...r, ...dest } : r)));
      setSavedId(accountId); setTimeout(() => setSavedId(null), 1500);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!rows) {
    return error
      ? <p className="text-sm text-red-600">{error}</p>
      : <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const body = (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Each person’s “On My Way” target. When they trigger OMW, the Live Activity tracks their live
        location toward this point. David → Blinco Grove, Katie → Bishops Court.
      </p>

      {rows.map((r) => (
        <div key={r.account_id} className="rounded-xl border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {r.name || r.username}
              <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-400">{r.role}</span>
            </p>
            {savedId === r.account_id && <span className="text-xs text-emerald-600">Saved ✓</span>}
          </div>
          <p className="mt-1 text-xs">
            {r.label ? (
              <>
                <span className="font-medium">{r.label}</span>
                <span className="ml-1 text-[10px] text-neutral-400">
                  ({Number(r.lat).toFixed(4)}, {Number(r.lng).toFixed(4)})
                </span>
              </>
            ) : (
              <span className="text-neutral-400">no destination set</span>
            )}
          </p>
          <div className="mt-2">
            <LocationPicker onPick={(loc) => save(r.account_id, loc)} />
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {busy && <p className="text-xs text-neutral-400">Saving…</p>}
    </div>
  );

  if (bare) return body;
  return <section className="rounded-2xl border border-neutral-200 bg-white p-4">{body}</section>;
}
