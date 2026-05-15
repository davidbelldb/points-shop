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

export default function AdminShutTheBoxSection() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Local edit buffers (so user can type freely without immediate save)
  const [hidden, setHidden] = useState('');
  const [inkC, setInkC] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  async function load() {
    try {
      const c = await api.admin.getStbConfig();
      setCfg(c);
      setHidden(c.hidden_message ?? '');
      setInkC(c.ink_colour ?? '');
      setTitle(c.homepage_title ?? '');
      setSubtitle(c.homepage_subtitle ?? '');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStbConfig(patch);
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

  function commitHidden() {
    if (hidden.length !== 9) {
      setError('Message must be exactly 9 characters (use _ for blank tiles).');
      return;
    }
    save({ hidden_message: hidden });
  }

  async function saveSet(ord, patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStbScatteredSet(ord, patch);
      setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function saveTableColour(ord, patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStbTableColour(ord, patch);
      setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function saveDicePalette(ord, patch) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await api.admin.updateStbDicePalette(ord, patch);
      setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
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
    return (
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Shut Katie's Box</h2>
        <p className="text-sm text-neutral-500">Loading...</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Shut Katie's Box</h2>
        {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Hidden message</p>
        <p className="mt-1 text-xs text-neutral-500">Exactly 9 characters. Use <code>_</code> for blank tiles.</p>
        <div className="mt-2 flex gap-2">
          <input
            value={hidden}
            onChange={(e) => setHidden(e.target.value.slice(0, 9))}
            maxLength={9}
            className={inputCls + ' font-mono tracking-widest'}
            placeholder="I_MISS_U!"
          />
          <button onClick={commitHidden} disabled={busy || hidden === cfg.hidden_message} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30">
            Save
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Current letters: {[1,2,3,4,5,6,7,8,9].map((i) => {
            const ch = (cfg.hidden_message || '').padEnd(9, '_').slice(0, 9)[i - 1];
            return ch === '_' ? '·' : ch;
          }).join(' ')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ColourField label="Ink (numbers + letters)" value={inkC} setValue={setInkC} current={cfg.ink_colour} onCommit={() => commitColour('ink_colour', inkC)} busy={busy} />
      </div>
      <p className="text-xs text-neutral-500">
        Felt, frame and tile colours are now driven by Poly Haven textures (velvet for the felt, wood for the frame and tiles). Drop the JPGs into <code>frontend/public/textures/</code>.
      </p>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Scattered tile messages</p>
        <p className="text-xs text-neutral-500">5 sets — the game picks one at random from the <em>active</em> sets on each page load. Each set has 8 tiles behind and 7 in front. Use <code>_</code> for blank tiles.</p>
        <div className="space-y-2">
          {(cfg.scattered_sets || []).map((s) => (
            <ScatteredSetEditor key={s.ord} set={s} busy={busy} onSave={(patch) => saveSet(s.ord, patch)} />
          ))}
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Background surface colours</p>
        <p className="text-xs text-neutral-500">3 slots — the game picks one at random from the <em>active</em> slots on each page load.</p>
        <div className="space-y-2">
          {(cfg.table_colours || []).map((t) => (
            <TableColourEditor key={t.ord} slot={t} busy={busy} onSave={(patch) => saveTableColour(t.ord, patch)} />
          ))}
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Dice palettes</p>
        <p className="text-xs text-neutral-500">4 palettes — each die independently picks one at random from the <em>active</em> palettes on every throw. So dice 1 and dice 2 can come out different colours.</p>
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
          placeholder="Title (e.g. Shut Katie's Box)"
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
    </section>
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
        <span className="inline-block h-6 w-6 shrink-0 rounded border border-neutral-300" style={{ background: slot.body }} title="Body" />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={inputCls + ' font-mono'}
          placeholder="Body #e773b0"
        />
        <span className="inline-block h-6 w-6 shrink-0 rounded border border-neutral-300" style={{ background: slot.pip }} title="Pip" />
        <input
          value={pip}
          onChange={(e) => setPip(e.target.value)}
          className={inputCls + ' font-mono'}
          placeholder="Pip #000000"
        />
        <button
          onClick={() => onSave({ body, pip })}
          disabled={busy || !dirty || !valid}
          className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function TableColourEditor({ slot, busy, onSave }) {
  const [val, setVal] = useState(slot.colour ?? '');
  useEffect(() => { setVal(slot.colour ?? ''); }, [slot.colour]);
  const dirty = val !== (slot.colour ?? '');
  const HEX = /^#[0-9a-fA-F]{6}$/;

  function commit() {
    if (!HEX.test(val)) return;
    onSave({ colour: val });
  }
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">Slot {slot.ord}</span>
        <button
          onClick={() => onSave({ active: !slot.active })}
          disabled={busy}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${slot.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {slot.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-6 w-6 rounded border border-neutral-300" style={{ background: slot.colour }} />
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { if (dirty && HEX.test(val)) commit(); }}
          className={inputCls + ' font-mono'}
          placeholder="#d3f3ea"
        />
        <button
          onClick={commit}
          disabled={busy || !dirty || !HEX.test(val)}
          className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30"
        >
          Save
        </button>
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
        <button
          onClick={() => onSave({ active: !set.active })}
          disabled={busy}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${set.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {set.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={back}
          onChange={(e) => setBack(e.target.value.slice(0, 8))}
          maxLength={8}
          className={inputCls + ' font-mono tracking-widest'}
          placeholder="Behind (8)"
        />
        <input
          value={front}
          onChange={(e) => setFront(e.target.value.slice(0, 7))}
          maxLength={7}
          className={inputCls + ' font-mono tracking-widest'}
          placeholder="Front (7)"
        />
        <button
          onClick={() => onSave({ back, front })}
          disabled={busy || !dirty}
          className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30"
        >
          Save
        </button>
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
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { if (value !== current) onCommit(); }}
          className={inputCls + ' font-mono'}
          placeholder="#15b8a6"
        />
      </div>
    </div>
  );
}
