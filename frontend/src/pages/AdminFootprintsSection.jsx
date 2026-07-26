import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/*
 * Admin controls for the "Marauder's Map" footprints trail. Each mode ('outdoor'
 * GPS, 'indoor' UWB) is configured independently: whether it's broadcasting, the
 * stride between prints, how long a print lingers, and the max trail length.
 */

const FIELDS = [
  { key: 'spacing_m', label: 'Footprint spacing (m)', step: '0.05', min: '0.1' },
  { key: 'fade_seconds', label: 'Fade duration (s)', step: '10', min: '5' },
  { key: 'trail_length', label: 'Trail length (max prints)', step: '5', min: '1' },
];

function ModeCard({ mode, cfg, onSave }) {
  const [local, setLocal] = useState(cfg);
  useEffect(() => { setLocal(cfg); }, [cfg]);
  const set = (k, v) => setLocal((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold capitalize">{mode}</p>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={!!local.enabled}
            onChange={(e) => onSave(mode, { enabled: e.target.checked })}
          />
          Broadcasting
        </label>
      </div>
      {FIELDS.map((f) => (
        <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-neutral-600">{f.label}</span>
          <input
            type="number"
            step={f.step}
            min={f.min}
            value={local[f.key] ?? ''}
            onChange={(e) => set(f.key, e.target.value)}
            onBlur={(e) => onSave(mode, { [f.key]: Number(e.target.value) })}
            className="w-28 rounded-md border border-neutral-200 px-2 py-1 text-right"
          />
        </label>
      ))}
      <p className="text-[11px] text-neutral-400">
        {mode === 'indoor'
          ? 'Indoor (UWB) — hardware pending; safe to configure ahead of time.'
          : 'Outdoor (GPS) — live.'}
      </p>
    </div>
  );
}

export default function AdminFootprintsSection() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    try { setSettings(await api.footprints.settings()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(mode, patch) {
    setError(null);
    try {
      const updated = await api.footprints.saveSettings(mode, patch);
      setSettings((s) => ({ ...s, [mode]: updated }));
      setSaved(true); setTimeout(() => setSaved(false), 1200);
    } catch (e) { setError(e.message); }
  }

  if (!settings) {
    return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-neutral-500">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        The fading footprint trail. Spacing = stride between prints; fade = how long a print lingers before it
        disappears; trail length = max prints kept. Currently David-only while testing.
      </p>
      {['outdoor', 'indoor'].map((mode) => (
        settings[mode] ? <ModeCard key={mode} mode={mode} cfg={settings[mode]} onSave={save} /> : null
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-xs text-emerald-600">Saved ✓</p>}
    </div>
  );
}
