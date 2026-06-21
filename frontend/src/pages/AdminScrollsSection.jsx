import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { assetUrl } from '../components/scrolls/scrollAssets.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500';

const SETTINGS_FIELDS = [
  { key: 'frame_rate_fps', label: 'Frame rate (fps)', type: 'number', hint: 'Global default; per-frame duration overrides this.' },
  { key: 'crow_speed_kmh', label: 'Crow speed (km/h)', type: 'number', hint: 'A real raven ≈ 45.' },
  { key: 'speed_multiplier', label: 'Speed multiplier (time compression ×)', type: 'number', hint: 'In-world seconds per real second. 1 = realistic/medieval (3km ≈ 4min), 60 = 1 raven-hr per real-min, 99999 ≈ instant. Lower = slower delivery.' },
  { key: 'min_flight_seconds', label: 'Min flight (s)', type: 'number' },
  { key: 'max_flight_seconds', label: 'Max flight (s)', type: 'number' },
  { key: 'max_chars', label: 'Max scroll characters', type: 'number' },
  { key: 'scroll_font', label: 'Scroll font family', type: 'text' },
  { key: 'scroll_bg_file', label: 'Scroll background file', type: 'text' },
  { key: 'seal_open_file', label: 'Wax seal (open) file', type: 'text' },
  { key: 'seal_stamped_file', label: 'Wax seal (stamped) file', type: 'text' },
];
// Branch sprite + X/Y/scale/rotation/opacity are edited as a pinned row inside
// each sequence's frame list (see FramesEditor), not here.
const NUMERIC = new Set(SETTINGS_FIELDS.filter((f) => f.type === 'number').map((f) => f.key));

function SettingsForm({ settings, onSaved }) {
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = {};
    for (const f of SETTINGS_FIELDS) d[f.key] = settings?.[f.key] ?? '';
    setDraft(d);
    setDirty(false);
  }, [settings]);

  function set(key, val) { setDraft((d) => ({ ...d, [key]: val })); setDirty(true); }

  async function save() {
    setSaving(true);
    try {
      const patch = {};
      for (const f of SETTINGS_FIELDS) {
        patch[f.key] = NUMERIC.has(f.key) ? Number(draft[f.key]) : (draft[f.key] ?? '');
      }
      await api.scrolls.saveSettings(patch);
      setDirty(false);
      onSaved?.();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-sm font-semibold">Global settings</p>
      <div className="grid grid-cols-2 gap-3">
        {SETTINGS_FIELDS.map((f) => (
          <div key={f.key} className={f.type === 'text' ? 'col-span-2' : ''}>
            <label className={labelCls}>{f.label}</label>
            <input
              type={f.type}
              value={draft[f.key] ?? ''}
              onChange={(e) => set(f.key, e.target.value)}
              className={inputCls}
            />
            {f.hint && <p className="mt-0.5 text-[10px] text-neutral-400">{f.hint}</p>}
          </div>
        ))}
      </div>
      <button
        onClick={save}
        disabled={!dirty || saving}
        className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}

/* Contained preview: maps the 0..100 frame coords into a bounded stage so you
   can tune x/y and watch the sequence without it flying off-screen. */
function LayerPreview({ frames, fps, branch }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!playing || frames.length === 0) return undefined;
    let idx = 0;
    setI(0);
    const step = () => {
      if (idx >= frames.length - 1) { setPlaying(false); return; }
      idx += 1; setI(idx);
      timer.current = setTimeout(step, frames[idx]?.duration_ms || 1000 / (fps || 12));
    };
    timer.current = setTimeout(step, frames[0]?.duration_ms || 1000 / (fps || 12));
    return () => clearTimeout(timer.current);
  }, [playing, frames, fps]);

  const f = frames[Math.min(i, frames.length - 1)] || { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 };
  const url = assetUrl(f.sprite_file);

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-neutral-300 bg-gradient-to-b from-sky-100 to-amber-50" style={{ aspectRatio: '3 / 2' }}>
        {/* branch (behind the crow) */}
        {branch?.file && assetUrl(branch.file) && (
          <img
            src={assetUrl(branch.file)}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: `${branch.x ?? 50}%`,
              top: `${branch.y ?? 58}%`,
              width: `${22 * (Number(branch.scale) || 1)}%`,
              transform: `translate(-50%,-50%) rotate(${Number(branch.rotation) || 0}deg)`,
              opacity: branch.opacity == null ? 1 : Number(branch.opacity),
            }}
          />
        )}
        {/* crow at current frame */}
        <div
          style={{
            position: 'absolute', left: `${f.x}%`, top: `${f.y}%`,
            width: `${14 * (Number(f.scale) || 1)}%`,
            transform: `translate(-50%,-50%) rotate(${Number(f.rotation) || 0}deg)`,
            opacity: f.opacity == null ? 1 : Number(f.opacity),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {url
            ? <img src={url} alt="" className="w-full object-contain" onError={(e) => { e.currentTarget.replaceWith(document.createTextNode('🐦‍⬛')); }} />
            : <span style={{ fontSize: '2rem' }}>🐦‍⬛</span>}
        </div>
        <span className="absolute left-1 top-1 rounded bg-black/40 px-1 text-[10px] text-white">frame {i + 1}/{frames.length}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setPlaying((p) => !p)} className="rounded-md bg-neutral-800 px-3 py-1 text-xs font-semibold text-white">
          {playing ? '■ Stop' : '▶ Play'}
        </button>
        <input
          type="range" min={0} max={Math.max(0, frames.length - 1)} value={i}
          onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
          className="flex-1"
        />
      </div>
    </div>
  );
}

const FRAME_COLS = [
  ['sprite_file', 'Sprite', 'text'],
  ['x', 'X', 'number'],
  ['y', 'Y', 'number'],
  ['scale', 'Scale', 'number'],
  ['rotation', 'Rot°', 'number'],
  ['opacity', 'Opacity', 'number'],
  ['duration_ms', 'ms', 'number'],
];

function FramesEditor({ layer, initial, fps, branch, onSaved }) {
  const [rows, setRows] = useState(initial || []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRows(initial || []); setDirty(false); }, [initial]);

  // Pinned branch row (edits scrolls_settings, not the frames table).
  const [branchDraft, setBranchDraft] = useState(branch || {});
  useEffect(() => { setBranchDraft(branch || {}); }, [branch]);
  const BK = layer === 'send'
    ? { file: 'send_branch_file', x: 'send_branch_x', y: 'send_branch_y', scale: 'send_branch_scale', rotation: 'send_branch_rotation', opacity: 'send_branch_opacity' }
    : { file: 'land_branch_file', x: 'land_branch_x', y: 'land_branch_y', scale: 'land_branch_scale', rotation: 'land_branch_rotation', opacity: 'land_branch_opacity' };
  function setBranchCell(key, val) { setBranchDraft((d) => ({ ...d, [key]: val })); setDirty(true); }

  function setCell(idx, key, val) {
    setRows((r) => r.map((row, j) => (j === idx ? { ...row, [key]: val } : row)));
    setDirty(true);
  }
  function addRow() {
    const last = rows[rows.length - 1];
    setRows((r) => [...r, {
      sprite_file: `crow_${layer}_${String(r.length).padStart(2, '0')}.png`,
      x: last?.x ?? 50, y: last?.y ?? 50, scale: 1, rotation: 0, opacity: 1, duration_ms: 80,
    }]);
    setDirty(true);
  }
  function removeRow(idx) { setRows((r) => r.filter((_, j) => j !== idx)); setDirty(true); }
  function move(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    setRows((r) => { const c = [...r]; [c[idx], c[j]] = [c[j], c[idx]]; return c; });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const clean = rows.map((row) => ({
        sprite_file: String(row.sprite_file || '').trim(),
        x: Number(row.x), y: Number(row.y), scale: Number(row.scale),
        rotation: Number(row.rotation), opacity: Number(row.opacity),
        duration_ms: parseInt(row.duration_ms, 10) || 80,
      }));
      await api.scrolls.saveFrames(layer, clean);
      await api.scrolls.saveSettings({
        [BK.file]: String(branchDraft.file || '').trim(),
        [BK.x]: Number(branchDraft.x), [BK.y]: Number(branchDraft.y),
        [BK.scale]: Number(branchDraft.scale), [BK.rotation]: Number(branchDraft.rotation),
        [BK.opacity]: Number(branchDraft.opacity),
      });
      setDirty(false);
      onSaved?.();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-sm font-semibold capitalize">{layer} sequence — {rows.length} frames</p>

      <LayerPreview frames={rows} fps={fps} branch={branchDraft} />

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="pr-1">#</th>
              {FRAME_COLS.map(([, label]) => <th key={label} className="px-1">{label}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {layer === 'send' && (
              <tr className="border-y-2 border-amber-300 bg-amber-100/60">
                <td className="pr-1 text-[9px] font-bold uppercase text-amber-700">branch</td>
                {FRAME_COLS.map(([key, , type]) => (key === 'duration_ms'
                  ? <td key={key} className="px-1 text-center text-neutral-300">—</td>
                  : (
                    <td key={key} className="px-1 py-0.5">
                      <input type={type} value={branchDraft[key] ?? ''} onChange={(e) => setBranchCell(key, e.target.value)}
                        className={`rounded border border-amber-300 bg-white px-1 py-0.5 ${key === 'sprite_file' ? 'w-32' : 'w-14'}`}
                        step={type === 'number' ? 'any' : undefined} />
                    </td>
                  )))}
                <td />
              </tr>
            )}
            {rows.map((row, idx) => (
              <tr key={idx} className="border-t border-neutral-200">
                <td className="pr-1 text-neutral-400">{idx}</td>
                {FRAME_COLS.map(([key, , type]) => (
                  <td key={key} className="px-1 py-0.5">
                    <input
                      type={type}
                      value={row[key] ?? ''}
                      onChange={(e) => setCell(idx, key, e.target.value)}
                      className={`rounded border border-neutral-200 bg-white px-1 py-0.5 ${key === 'sprite_file' ? 'w-32' : 'w-14'}`}
                      step={type === 'number' ? 'any' : undefined}
                    />
                  </td>
                ))}
                <td className="whitespace-nowrap px-1 text-neutral-400">
                  <button onClick={() => move(idx, -1)} title="Up" className="px-0.5">↑</button>
                  <button onClick={() => move(idx, 1)} title="Down" className="px-0.5">↓</button>
                  <button onClick={() => removeRow(idx)} title="Remove" className="px-0.5 text-red-600">×</button>
                </td>
              </tr>
            ))}
            {layer === 'land' && (
              <tr className="border-y-2 border-amber-300 bg-amber-100/60">
                <td className="pr-1 text-[9px] font-bold uppercase text-amber-700">branch</td>
                {FRAME_COLS.map(([key, , type]) => (key === 'duration_ms'
                  ? <td key={key} className="px-1 text-center text-neutral-300">—</td>
                  : (
                    <td key={key} className="px-1 py-0.5">
                      <input type={type} value={branchDraft[key] ?? ''} onChange={(e) => setBranchCell(key, e.target.value)}
                        className={`rounded border border-amber-300 bg-white px-1 py-0.5 ${key === 'sprite_file' ? 'w-32' : 'w-14'}`}
                        step={type === 'number' ? 'any' : undefined} />
                    </td>
                  )))}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={addRow} className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium">+ Add frame</button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-amber-600 px-4 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : `Save ${layer} (frames + branch)`}
        </button>
      </div>
    </div>
  );
}

export default function AdminScrollsSection() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    try { setConfig(await api.scrolls.config()); setError(null); }
    catch (e) { setError(e.message || 'Failed to load scroll config'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-sm text-neutral-500">Loading scroll config…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const fps = config?.settings?.frame_rate_fps || 12;

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Coordinates are on a 0–100 stage (0 = left/top, 100 = right/bottom), responsive across devices.
        Send flies low-left → high-right; landing comes high-right → low-right. Drop sprites in
        <code className="px-1">frontend/public/scrolls/</code>.
      </p>
      <SettingsForm settings={config.settings} onSaved={load} />
      <FramesEditor
        layer="send" initial={config.send} fps={fps} onSaved={load}
        branch={{
          file: config.settings?.send_branch_file,
          x: config.settings?.send_branch_x, y: config.settings?.send_branch_y,
          scale: config.settings?.send_branch_scale, rotation: config.settings?.send_branch_rotation,
          opacity: config.settings?.send_branch_opacity,
        }}
      />
      <FramesEditor
        layer="land" initial={config.land} fps={fps} onSaved={load}
        branch={{
          file: config.settings?.land_branch_file,
          x: config.settings?.land_branch_x, y: config.settings?.land_branch_y,
          scale: config.settings?.land_branch_scale, rotation: config.settings?.land_branch_rotation,
          opacity: config.settings?.land_branch_opacity,
        }}
      />
    </div>
  );
}
