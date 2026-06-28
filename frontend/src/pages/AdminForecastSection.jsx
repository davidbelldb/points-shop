import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

const DAY_LABELS = [
  { v: 0, label: 'Sun' }, { v: 1, label: 'Mon' }, { v: 2, label: 'Tue' },
  { v: 3, label: 'Wed' }, { v: 4, label: 'Thu' }, { v: 5, label: 'Fri' }, { v: 6, label: 'Sat' },
];

/* Compact location search — same Nominatim source as the scroll composer. */
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
      <input className={inputCls} value={q} onChange={onInput} placeholder="Search a new location…" />
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

export default function AdminForecastSection({ bare = false }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [testMsg, setTestMsg] = useState(null);
  const [newTime, setNewTime] = useState('07:30');

  async function load() {
    try { setCfg(await api.scrolls.getForecastConfig()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      setCfg(await api.scrolls.updateForecastConfig(patch));
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function toggleDay(day) {
    const days = Array.isArray(cfg.send_days) ? cfg.send_days : [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    save({ send_days: next });
  }

  function addTime() {
    if (!/^\d{2}:\d{2}$/.test(newTime)) return;
    const times = Array.isArray(cfg.send_times) ? cfg.send_times : [];
    if (times.includes(newTime)) return;
    save({ send_times: [...times, newTime].sort() });
  }

  function removeTime(t) {
    const times = (cfg.send_times ?? []).filter((x) => x !== t);
    save({ send_times: times });
  }

  async function sendTest() {
    setTestMsg(null); setBusy(true);
    try { await api.scrolls.sendForecastTest(); setTestMsg('Forecast crow dispatched ✓'); }
    catch (e) { setTestMsg(e.message); } finally { setBusy(false); }
  }

  if (!cfg) {
    return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const body = (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Sends a daily 3-line weather forecast as a scroll from “the Three-Eyed Crow”. Weather is
        pulled live from Open-Meteo for the location below.
      </p>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Daily forecast scroll</p>
        <button
          onClick={() => save({ enabled: !cfg.enabled })}
          disabled={busy}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${cfg.enabled ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {cfg.enabled ? 'On' : 'Off'}
        </button>
      </div>

      <div>
        <p className="text-xs text-neutral-500">Send on these days:</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {DAY_LABELS.map((d) => {
            const active = (cfg.send_days ?? []).includes(d.v);
            return (
              <button
                key={d.v}
                onClick={() => toggleDay(d.v)}
                disabled={busy}
                className={`rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-amber-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block text-xs font-medium text-neutral-600">
        Who receives it
        <select
          className={inputCls + ' mt-1'}
          value={cfg.recipient || 'partner'}
          onChange={(e) => save({ recipient: e.target.value })}
          disabled={busy}
        >
          <option value="partner">Katie only</option>
          <option value="me">Me only (testing — Katie not notified)</option>
          <option value="both">Both of us</option>
        </select>
      </label>

      <div>
        <p className="text-xs text-neutral-500">Send times (UK time):</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {(cfg.send_times ?? []).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              {t}
              <button onClick={() => removeTime(t)} disabled={busy} className="text-amber-700 hover:text-red-600" aria-label={`Remove ${t}`}>×</button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className={inputCls + ' w-32'} />
          <button onClick={addTime} disabled={busy} className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white">Add time</button>
        </div>
      </div>

      <div>
        <p className="text-xs text-neutral-500">Forecast location:</p>
        <p className="mb-1 text-sm font-medium text-neutral-800">
          {cfg.location_label} <span className="text-[10px] text-neutral-400">({Number(cfg.location_lat).toFixed(4)}, {Number(cfg.location_lng).toFixed(4)})</span>
        </p>
        <LocationPicker onPick={(loc) => save({ location_label: loc.label, location_lat: loc.lat, location_lng: loc.lng })} />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={sendTest} disabled={busy} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
          Send a test now
        </button>
        {testMsg && <span className="text-xs text-neutral-600">{testMsg}</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">Saved ✓</p>}
    </div>
  );

  if (bare) return body;
  return <section className="rounded-2xl border border-neutral-200 bg-white p-4">{body}</section>;
}
