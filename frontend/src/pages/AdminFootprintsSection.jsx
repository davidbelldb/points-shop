import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { startFootprints, stopFootprints, isFootprintsTracking } from '../lib/footprintsTracker.js';
import { isSimOn, setSimOn } from '../lib/footprintsSim.js';
import { isCalibratorShown, setCalibratorShown } from '../lib/footprintsCalibrator.js';

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
        Phone GPS — David starts/ends tracking from the map.
      </p>
    </div>
  );
}

export default function AdminFootprintsSection() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tracking, setTracking] = useState(isFootprintsTracking());
  const [simOn, setSimOnState] = useState(isSimOn());

  function toggleTracking() {
    if (tracking) { stopFootprints(); setTracking(false); }
    else { startFootprints(); setTracking(true); }
  }

  function toggleSim() {
    const next = !simOn;
    setSimOn(next);
    setSimOnState(next);
  }

  const [calShown, setCalShown] = useState(isCalibratorShown());
  function toggleCalibrator() {
    const next = !calShown;
    setCalibratorShown(next);
    setCalShown(next);
  }

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
        The fading footprint trail (phone GPS). Spacing = stride between prints; fade = how long a print lingers
        before it disappears; trail length = max prints kept. Currently David-only while testing.
      </p>
      {settings.outdoor ? <ModeCard mode="outdoor" cfg={settings.outdoor} onSave={save} /> : null}

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
        <div>
          <p className="text-sm font-semibold">Live tracking (this device)</p>
          <p className="text-[11px] text-neutral-400">
            {tracking ? 'Broadcasting your footsteps from this phone.' : 'Start to broadcast your footsteps as you walk.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleTracking}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tracking ? 'bg-neutral-800 text-white' : 'bg-emerald-600 text-white'}`}
        >
          {tracking ? 'End tracking' : 'Start tracking'}
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
        <div>
          <p className="text-sm font-semibold">Simulate footsteps</p>
          <p className="text-[11px] text-neutral-400">
            {simOn ? 'A fake walk is running through the house on the map.' : 'Fake a walk through the house (open the Marauder map to watch).'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSim}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${simOn ? 'bg-neutral-800 text-white' : 'bg-amber-600 text-white'}`}
        >
          {simOn ? 'Stop simulation' : 'Simulate'}
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
        <div>
          <p className="text-sm font-semibold">Calibrate button</p>
          <p className="text-[11px] text-neutral-400">
            {calShown ? 'The “Calibrate floorplan” button is shown on the map.' : 'Hidden — placement is locked in.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleCalibrator}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${calShown ? 'bg-neutral-800 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {calShown ? 'Hide' : 'Show'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-xs text-emerald-600">Saved ✓</p>}
    </div>
  );
}
