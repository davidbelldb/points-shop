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

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function AdminShutTheBox15Section({ bare = false }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [sceneProps, setSceneProps] = useState([]);

  const [inkC, setInkC] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  async function load() {
    try {
      const [c, props] = await Promise.all([
        api.admin.getStb15Config(),
        api.admin.getStb15Props(),
      ]);
      setCfg(c);
      setInkC(c.ink_colour ?? '');
      setTitle(c.homepage_title ?? '');
      setSubtitle(c.homepage_subtitle ?? '');
      if (Array.isArray(props)) setSceneProps(props);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStb15Config(patch);
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

  async function saveTileMessage(ord, patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStb15TileMessage(ord, patch);
      setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveSet(ord, patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStb15ScatteredSet(ord, patch);
      setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveTableColour(ord, patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStb15TableColour(ord, patch);
      setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveDicePalette(ord, patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStb15DicePalette(ord, patch);
      setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveProp(key, patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStb15Prop(key, patch);
      setSceneProps((prev) => prev.map((p) => (p.key === key ? updated : p)));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function commitColour(field, value) {
    if (!HEX_RE.test(value)) {
      setError(`${field} must be a hex like #15b8a6`);
      return;
    }
    save({ [field]: value });
  }

  function commitText() {
    save({ homepage_title: title, homepage_subtitle: subtitle || null });
  }

  if (!cfg) {
    if (bare) return <div className="space-y-2"><p className="text-sm text-neutral-500">Loading...</p>{error && <p className="text-sm text-red-600">{error}</p>}</div>;
    return (
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Shut the Box 15</h2>
        <p className="text-sm text-neutral-500">Loading...</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  const savedIndicator = saved && <span className="text-xs text-emerald-600">Saved ✓</span>;

  const body = (
    <div className="space-y-3">
      {savedIndicator}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Hidden tile messages</p>
        <p className="text-xs text-neutral-500">Up to 10 messages, each exactly <strong>15 characters</strong>. Picked at random from <em>active</em> messages each new game. Use <code>_</code> for blank tiles.</p>
        <div className="space-y-2">
          {(cfg.tile_messages || []).map((m) => (
            <TileMessageEditor key={m.ord} slot={m} busy={busy} onSave={(patch) => saveTileMessage(m.ord, patch)} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ColourField label="Ink (numbers + letters)" value={inkC} setValue={setInkC} current={cfg.ink_colour} onCommit={() => commitColour('ink_colour', inkC)} busy={busy} />
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Scattered tile messages</p>
        <p className="text-xs text-neutral-500">5 sets — picked at random from <em>active</em> sets on page load. 10 tiles behind, 9 in front. Use <code>_</code> for blank.</p>
        <div className="space-y-2">
          {(cfg.scattered_sets || []).map((s) => (
            <ScatteredSetEditor key={s.ord} set={s} busy={busy} onSave={(patch) => saveSet(s.ord, patch)} />
          ))}
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Background surface colours</p>
        <p className="text-xs text-neutral-500">3 slots — picked at random from <em>active</em> slots on page load.</p>
        <div className="space-y-2">
          {(cfg.table_colours || []).map((t) => (
            <TableColourEditor key={t.ord} slot={t} busy={busy} onSave={(patch) => saveTableColour(t.ord, patch)} />
          ))}
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Dice palettes</p>
        <p className="text-xs text-neutral-500">4 palettes — each die picks one independently at random on every throw.</p>
        <div className="space-y-2">
          {(cfg.dice_palettes || []).map((p) => (
            <DicePaletteEditor key={p.ord} slot={p} busy={busy} onSave={(patch) => saveDicePalette(p.ord, patch)} />
          ))}
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
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
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitText}
          className={inputCls}
          placeholder="Title (e.g. Shut the Box 15)"
        />
        <input
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          onBlur={commitText}
          className={inputCls}
          placeholder="Subtitle (optional)"
        />
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
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">3D scene objects</p>
        <p className="text-xs text-neutral-500">
          Position (X / Z) and scale for each prop on the granite surface. X is left/right, Z is back/front (negative = behind box). Rotation is Y-axis in degrees. Changes take effect on next page load.
        </p>
        {sceneProps.length === 0 && <p className="text-xs text-neutral-400">No props found — run DB migration 070.</p>}
        <div className="space-y-2">
          {sceneProps.map((p) => (
            <ScenePropEditor key={p.key} prop={p} busy={busy} onSave={(patch) => saveProp(p.key, patch)} />
          ))}
        </div>
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Shut the Box 15</h2>
        {savedIndicator}
      </div>
      {body}
    </section>
  );
}

function TileMessageEditor({ slot, busy, onSave }) {
  const [msg, setMsg] = useState(slot.message ?? '');
  useEffect(() => { setMsg(slot.message ?? ''); }, [slot.message]);
  const dirty = msg !== (slot.message ?? '');
  const valid = msg.length === 15;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">Message {slot.ord}</span>
        <button
          onClick={() => onSave({ active: !slot.active })}
          disabled={busy}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${slot.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {slot.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value.slice(0, 15))}
          maxLength={15}
          className={inputCls + ' font-mono tracking-widest'}
          placeholder="I_MISS_YOU_SO!!"
        />
        <button
          onClick={() => { if (valid) onSave({ message: msg }); }}
          disabled={busy || !dirty || !valid}
          className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30"
        >
          Save
        </button>
      </div>
      <p className="text-[11px] text-neutral-400">{msg.length}/15 chars</p>
    </div>
  );
}

function DicePaletteEditor({ slot, busy, onSave }) {
  const [body, setBody] = useState(slot.body ?? '');
  const [pip, setPip] = useState(slot.pip ?? '');
  useEffect(() => { setBody(slot.body ?? ''); setPip(slot.pip ?? ''); }, [slot.body, slot.pip]);
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const dirty = body !== (slot.body ?? '') || pip !== (slot.pip ?? '');
  const valid = HEX.test(body) && HEX.test(pip);

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">Palette {slot.ord}</span>
        <button
          onClick={() => onSave({ active: !slot.active })}
          disabled={busy}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${slot.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {slot.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-6 w-6 shrink-0 rounded border border-neutral-300" style={{ background: slot.body }} />
        <input value={body} onChange={(e) => setBody(e.target.value)} className={inputCls + ' font-mono'} placeholder="Body #e773b0" />
        <span className="inline-block h-6 w-6 shrink-0 rounded border border-neutral-300" style={{ background: slot.pip }} />
        <input value={pip} onChange={(e) => setPip(e.target.value)} className={inputCls + ' font-mono'} placeholder="Pip #000000" />
        <button onClick={() => onSave({ body, pip })} disabled={busy || !dirty || !valid} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30">Save</button>
      </div>
    </div>
  );
}

function TableColourEditor({ slot, busy, onSave }) {
  const [val, setVal] = useState(slot.colour ?? '');
  useEffect(() => { setVal(slot.colour ?? ''); }, [slot.colour]);
  const dirty = val !== (slot.colour ?? '');
  const HEX = /^#[0-9a-fA-F]{6}$/;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">Slot {slot.ord}</span>
        <button onClick={() => onSave({ active: !slot.active })} disabled={busy} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${slot.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
          {slot.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-6 w-6 rounded border border-neutral-300" style={{ background: slot.colour }} />
        <input value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => { if (dirty && HEX.test(val)) onSave({ colour: val }); }} className={inputCls + ' font-mono'} placeholder="#d3f3ea" />
        <button onClick={() => { if (HEX.test(val)) onSave({ colour: val }); }} disabled={busy || !dirty || !HEX.test(val)} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30">Save</button>
      </div>
    </div>
  );
}

function ScatteredSetEditor({ set, busy, onSave }) {
  const [back, setBack] = useState(set.back ?? '');
  const [front, setFront] = useState(set.front ?? '');
  useEffect(() => { setBack(set.back ?? ''); setFront(set.front ?? ''); }, [set.back, set.front]);
  const dirty = back !== (set.back ?? '') || front !== (set.front ?? '');

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">Set {set.ord}</span>
        <button onClick={() => onSave({ active: !set.active })} disabled={busy} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${set.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
          {set.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="flex gap-2">
        <input value={back} onChange={(e) => setBack(e.target.value.slice(0, 10))} maxLength={10} className={inputCls + ' font-mono tracking-widest'} placeholder="Behind (10)" />
        <input value={front} onChange={(e) => setFront(e.target.value.slice(0, 9))} maxLength={9} className={inputCls + ' font-mono tracking-widest'} placeholder="Front (9)" />
        <button onClick={() => onSave({ back, front })} disabled={busy || !dirty} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30">Save</button>
      </div>
    </div>
  );
}

function ScenePropEditor({ prop, busy, onSave }) {
  const [posX, setPosX]     = useState(String(prop.pos_x ?? 0));
  const [posZ, setPosZ]     = useState(String(prop.pos_z ?? 0));
  const [rotY, setRotY]     = useState(String(prop.rot_y_deg ?? 0));
  const [scale, setScale]   = useState(String(prop.scale ?? 1));
  useEffect(() => {
    setPosX(String(prop.pos_x ?? 0));
    setPosZ(String(prop.pos_z ?? 0));
    setRotY(String(prop.rot_y_deg ?? 0));
    setScale(String(prop.scale ?? 1));
  }, [prop]);

  const numInput = 'w-20 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none text-right font-mono';

  function commit() {
    onSave({
      pos_x:     parseFloat(posX)  || 0,
      pos_z:     parseFloat(posZ)  || 0,
      rot_y_deg: parseFloat(rotY)  || 0,
      scale:     parseFloat(scale) || 1,
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">{prop.label}</span>
        <button
          onClick={() => onSave({ active: !prop.active })}
          disabled={busy}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${prop.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {prop.active ? 'Visible' : 'Hidden'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center justify-between gap-2">
          <span className="text-neutral-500">X (left/right)</span>
          <input value={posX} onChange={(e) => setPosX(e.target.value)} onBlur={commit} className={numInput} step="0.1" type="number" />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-neutral-500">Z (back/front)</span>
          <input value={posZ} onChange={(e) => setPosZ(e.target.value)} onBlur={commit} className={numInput} step="0.1" type="number" />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-neutral-500">Rotation °</span>
          <input value={rotY} onChange={(e) => setRotY(e.target.value)} onBlur={commit} className={numInput} step="1" type="number" />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-neutral-500">Scale</span>
          <input value={scale} onChange={(e) => setScale(e.target.value)} onBlur={commit} className={numInput} step="0.01" type="number" />
        </label>
      </div>
    </div>
  );
}

function ColourField({ label, value, setValue, current, onCommit, busy }) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-700">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="inline-block h-6 w-6 rounded border border-neutral-300" style={{ background: current }} />
        <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => { if (value !== current) onCommit(); }} className={inputCls + ' font-mono'} placeholder="#15b8a6" />
      </div>
    </div>
  );
}
