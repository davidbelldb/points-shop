import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

const DAY_LABELS = [
  { v: 0, label: 'Sun' },
  { v: 1, label: 'Mon' },
  { v: 2, label: 'Tue' },
  { v: 3, label: 'Wed' },
  { v: 4, label: 'Thu' },
  { v: 5, label: 'Fri' },
  { v: 6, label: 'Sat' },
];

export default function AdminSneakyButtonSection({ bare = false }) {
  const [cfg, setCfg] = useState(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const c = await api.admin.getSneakyButtonConfig();
      setCfg(c);
      setLabel(c.button_label ?? '');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateSneakyButtonConfig(patch);
      setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  function toggleVisible() {
    if (!cfg) return;
    save({ homepage_visible: !cfg.homepage_visible });
  }

  function toggleDay(day) {
    if (!cfg) return;
    const days = Array.isArray(cfg.homepage_days) ? cfg.homepage_days : [];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    save({ homepage_days: next });
  }

  function commitLabel() {
    if (!cfg || label === cfg.button_label) return;
    save({ button_label: label });
  }

  if (!cfg) {
    return error
      ? <p className="text-sm text-red-600">{error}</p>
      : <p className="text-sm text-neutral-500">Loading...</p>;
  }

  const body = (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Adds a button below the hero slides (and above Shut the Box 15) that fetches a random,
        adorable gif of a cat or a duck for Katie.
      </p>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Home page placement</p>
        <button
          onClick={toggleVisible}
          disabled={busy}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${cfg.homepage_visible ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {cfg.homepage_visible ? 'Visible' : 'Hidden'}
        </button>
      </div>

      <div>
        <p className="text-xs text-neutral-500">Visible on these days:</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {DAY_LABELS.map((d) => {
            const active = (cfg.homepage_days ?? []).includes(d.v);
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
        Animal
        <select
          className={inputCls + ' mt-1'}
          value={cfg.animal_type}
          onChange={(e) => save({ animal_type: e.target.value })}
          disabled={busy}
        >
          <option value="cat">Cats only</option>
          <option value="duck">Ducks only</option>
          <option value="random">Surprise me (cat or duck)</option>
        </select>
      </label>

      <label className="block text-xs font-medium text-neutral-600">
        Button label
        <input
          className={inputCls + ' mt-1'}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          placeholder="🐾 Sneaky Button"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">Saved ✓</p>}
    </div>
  );

  if (bare) return body;
  return <section className="rounded-2xl border border-neutral-200 bg-white p-4">{body}</section>;
}
