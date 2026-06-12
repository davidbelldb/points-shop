import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';

const numInputCls =
  'w-20 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none text-right font-mono';
const colourInputCls =
  'w-24 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none font-mono';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Defaults mirrored from Magic8BallPage.jsx — used to seed the inputs when
// no override has been saved yet.
const DEFAULTS = {
  magic8ball_camera_x: '0',
  magic8ball_camera_y: '0.3',
  magic8ball_camera_z: '4',
  magic8ball_camera_fov: '35',
  magic8ball_light_ambient_intensity: '0.55',
  magic8ball_light_ambient_color: '#ffffff',
  magic8ball_light_dir1_intensity: '1',
  magic8ball_light_dir2_intensity: '0.3',
  magic8ball_light_point_intensity: '0.8',
  magic8ball_light_point_color: '#88aaff',
};

export default function AdminMagic8BallSection({ bare = false }) {
  const { settings, refresh } = useSettings();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const [vals, setVals] = useState(DEFAULTS);

  useEffect(() => {
    setVals((v) => {
      const next = { ...v };
      for (const key of Object.keys(DEFAULTS)) {
        if (settings[key] !== undefined) next[key] = settings[key];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.magic8ball_camera_x,
    settings.magic8ball_camera_y,
    settings.magic8ball_camera_z,
    settings.magic8ball_camera_fov,
    settings.magic8ball_light_ambient_intensity,
    settings.magic8ball_light_ambient_color,
    settings.magic8ball_light_dir1_intensity,
    settings.magic8ball_light_dir2_intensity,
    settings.magic8ball_light_point_intensity,
    settings.magic8ball_light_point_color,
  ]);

  function setVal(key, value) {
    setVals((v) => ({ ...v, [key]: value }));
  }

  async function save(key, value) {
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.admin.updateSettings({ [key]: String(value) });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  function commitNumber(key, fallback) {
    const n = parseFloat(vals[key]);
    const value = Number.isFinite(n) ? n : fallback;
    setVal(key, String(value));
    save(key, value);
  }

  function commitColour(key) {
    if (!HEX_RE.test(vals[key])) {
      setError(`${key} must be a hex colour like #88aaff`);
      return;
    }
    save(key, vals[key]);
  }

  const savedIndicator = saved && <span className="text-xs text-emerald-600">Saved ✓</span>;

  const body = (
    <div className="space-y-3">
      {savedIndicator}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Camera</p>
        <p className="text-xs text-neutral-500">
          Position of the camera once it settles on the 8-ball window (select / confirm / shaking / answer phases).
          X is left/right, Y is height, Z is distance toward you. FOV widens or narrows the view. Changes apply on page reload.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {[
            { label: 'Pos X', key: 'magic8ball_camera_x', fallback: 0 },
            { label: 'Pos Y (height)', key: 'magic8ball_camera_y', fallback: 0.3 },
            { label: 'Pos Z (distance)', key: 'magic8ball_camera_z', fallback: 4 },
            { label: 'FOV °', key: 'magic8ball_camera_fov', fallback: 35 },
          ].map(({ label, key, fallback }) => (
            <label key={key} className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">{label}</span>
              <input
                value={vals[key]}
                type="number"
                step="0.1"
                onChange={(e) => setVal(key, e.target.value)}
                onBlur={() => commitNumber(key, fallback)}
                className={numInputCls}
              />
            </label>
          ))}
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Lighting</p>
        <p className="text-xs text-neutral-500">
          Matches Shut the Box 15&apos;s day-mode rig by default. Ambient lights the whole scene evenly; the two
          directional lights add highlights/shading; the point light adds a coloured glow accent.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Ambient brightness</span>
            <input
              value={vals.magic8ball_light_ambient_intensity}
              type="number" min="0" max="5" step="0.05"
              onChange={(e) => setVal('magic8ball_light_ambient_intensity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_light_ambient_intensity', 0.55)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Ambient colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_light_ambient_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_light_ambient_color }} />
              )}
              <input
                value={vals.magic8ball_light_ambient_color}
                onChange={(e) => setVal('magic8ball_light_ambient_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_light_ambient_color')}
                className={colourInputCls}
                placeholder="#ffffff"
                maxLength={7}
              />
            </div>
          </label>

          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Directional 1 brightness</span>
            <input
              value={vals.magic8ball_light_dir1_intensity}
              type="number" min="0" max="5" step="0.05"
              onChange={(e) => setVal('magic8ball_light_dir1_intensity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_light_dir1_intensity', 1)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Directional 2 brightness</span>
            <input
              value={vals.magic8ball_light_dir2_intensity}
              type="number" min="0" max="5" step="0.05"
              onChange={(e) => setVal('magic8ball_light_dir2_intensity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_light_dir2_intensity', 0.3)}
              className={numInputCls}
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Point light brightness</span>
            <input
              value={vals.magic8ball_light_point_intensity}
              type="number" min="0" max="10" step="0.1"
              onChange={(e) => setVal('magic8ball_light_point_intensity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_light_point_intensity', 0.8)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Point light colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_light_point_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_light_point_color }} />
              )}
              <input
                value={vals.magic8ball_light_point_color}
                onChange={(e) => setVal('magic8ball_light_point_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_light_point_color')}
                className={colourInputCls}
                placeholder="#88aaff"
                maxLength={7}
              />
            </div>
          </label>
        </div>
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Magic 8-Ball</h2>
        {savedIndicator}
      </div>
      {body}
    </section>
  );
}
