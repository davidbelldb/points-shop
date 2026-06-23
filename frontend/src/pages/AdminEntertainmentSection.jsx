import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const PALETTE = ['#14b8a6', '#ed70bd', '#5fc4b1', '#f299d8', '#1f7a66', '#c4529a', '#7adfcf', '#f7c2e9'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const inputCls = 'rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';
const colourInputCls = 'w-24 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm font-mono focus:border-amber-500 focus:outline-none';

export default function AdminEntertainmentSection({ bare = false }) {
  const { settings, refresh: refreshSettings } = useSettings();
  const [titles, setTitles] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = () => api.admin.listEntertainmentTitles().then(setTitles).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.admin.listEntertainmentWatchlistTitles().then(setWatchlist).catch(() => setWatchlist([]));
  }, []);

  // Titles already on the wheel — so the picker only offers ones not yet added.
  const existing = new Set((titles ?? []).map((t) => t.label.toLowerCase()));
  const available = watchlist.filter((w) => !existing.has(w.toLowerCase()));

  async function add() {
    const label = pick.trim();
    if (!label) return;
    setBusy(true); setError(null);
    try {
      const color = PALETTE[(titles?.length ?? 0) % PALETTE.length];
      await api.admin.addEntertainmentTitle(label, color);
      setPick('');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function patch(id, body) {
    setError(null);
    try {
      const updated = await api.admin.updateEntertainmentTitle(id, body);
      setTitles((ts) => ts.map((t) => (t.id === id ? updated : t)));
    } catch (e) { setError(e.message); }
  }
  async function remove(id) {
    setBusy(true); setError(null);
    try { await api.admin.deleteEntertainmentTitle(id); setTitles((t) => t.filter((x) => x.id !== id)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // ---- Home-screen visibility settings ----
  const enabled = settings.entertainment_home_enabled === 'true';
  const days = (settings.entertainment_home_days || '').split(',').map((d) => d.trim()).filter(Boolean);
  const saveSetting = async (key, value) => {
    try { await api.admin.updateSettings({ [key]: String(value) }); await refreshSettings(); }
    catch (e) { setError(e.message); }
  };
  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    saveSetting('entertainment_home_days', next.join(','));
  };

  const body = (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Titles + colours */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Wheel titles</p>
        <p className="text-xs text-neutral-500">
          Pick titles from the watchlist (any of them — shared or not) and give each its own colour. A &ldquo;Bum Show&rdquo; segment is always added automatically.
        </p>
        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={`flex-1 ${inputCls}`}>
            <option value="">{available.length ? 'Choose a watchlist title…' : 'No more watchlist titles'}</option>
            {available.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <button onClick={add} disabled={busy || !pick} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40">Add</button>
        </div>

        {titles === null ? (
          <p className="text-xs text-neutral-400">Loading…</p>
        ) : titles.length === 0 ? (
          <p className="text-xs text-neutral-400">No titles on the wheel yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {titles.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="flex-1 truncate">{t.label}</span>
                <span className="inline-block h-5 w-5 shrink-0 rounded border border-neutral-300" style={{ background: t.color }} />
                <input
                  defaultValue={t.color}
                  maxLength={7}
                  className={colourInputCls}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== t.color && HEX_RE.test(v)) patch(t.id, { color: v });
                  }}
                />
                <button onClick={() => remove(t.id)} disabled={busy} className="text-xs font-semibold text-red-600">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr className="border-neutral-200" />

      {/* Home-screen visibility */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Show on home screen</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => saveSetting('entertainment_home_enabled', e.target.checked)} />
          Show the Wheel of Entertainment on the home screen
        </label>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {DAYS.map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${days.includes(d) ? 'bg-amber-600 text-amber-50' : 'bg-neutral-100 text-neutral-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400">No days selected = every day.</p>

        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500">From</span>
            <input type="time" defaultValue={settings.entertainment_home_start || ''} onBlur={(e) => saveSetting('entertainment_home_start', e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500">Until</span>
            <input type="time" defaultValue={settings.entertainment_home_end || ''} onBlur={(e) => saveSetting('entertainment_home_end', e.target.value)} className={inputCls} />
          </label>
        </div>
        <p className="text-[11px] text-neutral-400">Leave times blank to show all day.</p>

        <div className="grid gap-2 pt-1 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500">Home title</span>
            <input defaultValue={settings.entertainment_home_title || ''} placeholder="Wheel of Entertainment" onBlur={(e) => saveSetting('entertainment_home_title', e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500">Home subtitle</span>
            <input defaultValue={settings.entertainment_home_subtitle || ''} placeholder="What are we watching tonight?" onBlur={(e) => saveSetting('entertainment_home_subtitle', e.target.value)} className={inputCls} />
          </label>
        </div>
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <h2 className="text-base font-semibold">Wheel of Entertainment</h2>
      {body}
    </section>
  );
}
