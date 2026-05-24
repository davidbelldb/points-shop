import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function AdminDuckySection() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [water, setWater] = useState('');
  const [grass, setGrass] = useState('');
  const [mud, setMud] = useState('');
  const [buoy, setBuoy] = useState('');
  const [count, setCount] = useState(10);
  const [buoyCount, setBuoyCount] = useState(4);

  async function load() {
    try {
      const c = await api.admin.getDucky();
      setCfg(c);
      setWater(c.water_colour ?? '');
      setGrass(c.grass_colour ?? '');
      setMud(c.mud_colour ?? '');
      setBuoy(c.buoy_colour ?? '');
      setCount(c.race_duck_count ?? 10);
      setBuoyCount(c.buoy_count ?? 4);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function run(fn) {
    setBusy(true); setError(null); setSaved(false);
    try {
      const updated = await fn();
      if (updated) setCfg(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function saveConfig() {
    if (!HEX_RE.test(water)) { setError('Water colour must be a hex like #4aa3c7'); return; }
    if (!HEX_RE.test(grass)) { setError('Grass colour must be a hex like #5bbf3a'); return; }
    if (!HEX_RE.test(mud)) { setError('Mud colour must be a hex like #6b4a2a'); return; }
    if (!HEX_RE.test(buoy)) { setError('Buoy colour must be a hex like #e0322e'); return; }
    run(() => api.admin.updateDucky({
      water_colour: water, grass_colour: grass, mud_colour: mud, buoy_colour: buoy,
      race_duck_count: Number(count), buoy_count: Number(buoyCount),
    }));
  }

  if (!cfg) {
    return (
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Ducky Derby</h2>
        <p className="text-sm text-neutral-500">Loading...</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Ducky Derby</h2>
        {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <ColourInput label="Water colour" value={water} setValue={setWater} swatch={water} />
        <ColourInput label="Grass colour" value={grass} setValue={setGrass} swatch={grass} />
        <ColourInput label="Mud colour" value={mud} setValue={setMud} swatch={mud} />
        <ColourInput label="Buoy colour" value={buoy} setValue={setBuoy} swatch={buoy} />
        <div>
          <span className="text-[11px] text-neutral-500">Ducks per race</span>
          <select className={inputCls + ' mt-0.5'} value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((nn) => <option key={nn} value={nn}>{nn}</option>)}
          </select>
        </div>
        <div>
          <span className="text-[11px] text-neutral-500">Buoys per race</span>
          <select className={inputCls + ' mt-0.5'} value={buoyCount} onChange={(e) => setBuoyCount(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5, 6, 8, 10, 12].map((nn) => (
              <option key={nn} value={nn}>{nn === 0 ? 'Off' : nn}</option>
            ))}
          </select>
        </div>
      </div>
      <button onClick={saveConfig} disabled={busy} className="w-full rounded-md bg-amber-600 py-2 text-sm font-semibold text-white disabled:opacity-40">
        Save race settings
      </button>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Ducks (10)</p>
        {(cfg.ducks || []).map((d) => (
          <DuckEditor key={d.ord} duck={d} busy={busy} onSave={(patch) => run(() => api.admin.updateDuckyDuck(d.ord, patch))} />
        ))}
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Bank banners</p>
        <p className="text-[11px] text-neutral-400">Active banners are spread evenly along the course; top and bottom banks are spaced independently.</p>
        {(cfg.banners || []).map((b) => (
          <BannerRowEditor key={b.ord} row={b} label={`Banner ${b.ord}`} busy={busy}
            onSave={(patch) => run(() => api.admin.updateDuckyBanner(b.ord, patch))} />
        ))}
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Duck speech phrases</p>
        {(cfg.phrases || []).map((p) => (
          <TextRowEditor key={p.ord} row={p} label={`Phrase ${p.ord}`} busy={busy}
            onSave={(patch) => run(() => api.admin.updateDuckyPhrase(p.ord, patch))} />
        ))}
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Race commentary</p>
        <p className="text-[11px] text-neutral-400">Filler lines shown between the scripted beats — {'{duck}'} is replaced with a random racer name.</p>
        {(cfg.commentary || []).map((c) => (
          <TextRowEditor key={c.ord} row={c} label={`Line ${c.ord}`} busy={busy}
            onSave={(patch) => run(() => api.admin.updateDuckyCommentary(c.ord, patch))} />
        ))}
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Pre-race intro</p>
        <p className="text-[11px] text-neutral-400">Plays in order before each race — {'{duck}'} and {'{duck2}'} become two different racer names.</p>
        {(cfg.intro || []).map((c) => (
          <TextRowEditor key={c.ord} row={c} label={`Intro ${c.ord}`} busy={busy}
            onSave={(patch) => run(() => api.admin.updateDuckyIntro(c.ord, patch))} />
        ))}
      </div>
    </section>
  );
}

function BannerRowEditor({ row, label, busy, onSave }) {
  const [text, setText] = useState(row.text ?? '');
  const [placement, setPlacement] = useState(row.placement ?? 'top');
  useEffect(() => {
    setText(row.text ?? '');
    setPlacement(row.placement ?? 'top');
  }, [row.text, row.placement]);
  const dirty = text !== (row.text ?? '') || placement !== (row.placement ?? 'top');

  return (
    <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">{label}</span>
        <button
          onClick={() => onSave({ active: !row.active })}
          disabled={busy}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${row.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {row.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Banner text" />
      <div className="flex items-center gap-2">
        <select className={inputCls + ' flex-1'} value={placement} onChange={(e) => setPlacement(e.target.value)}>
          <option value="top">Top bank</option>
          <option value="bottom">Bottom bank</option>
        </select>
        <button onClick={() => onSave({ text, placement })} disabled={busy || !dirty} className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-30">
          Save
        </button>
      </div>
    </div>
  );
}

function ColourInput({ label, value, setValue, swatch }) {
  return (
    <label className="block">
      <span className="text-[11px] text-neutral-500">{label}</span>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="inline-block h-7 w-7 shrink-0 rounded border border-neutral-300" style={{ background: swatch }} />
        <input className={inputCls + ' font-mono'} value={value} onChange={(e) => setValue(e.target.value)} placeholder="#ffd23f" />
      </div>
    </label>
  );
}

function DuckEditor({ duck, busy, onSave }) {
  const [name, setName] = useState(duck.name ?? '');
  const [duckC, setDuckC] = useState(duck.duck_colour ?? '');
  const [billC, setBillC] = useState(duck.bill_colour ?? '');
  const [oNum, setONum] = useState(String(duck.odds_num ?? ''));
  const [oDen, setODen] = useState(String(duck.odds_den ?? ''));
  useEffect(() => {
    setName(duck.name ?? '');
    setDuckC(duck.duck_colour ?? '');
    setBillC(duck.bill_colour ?? '');
    setONum(String(duck.odds_num ?? ''));
    setODen(String(duck.odds_den ?? ''));
  }, [duck.name, duck.duck_colour, duck.bill_colour, duck.odds_num, duck.odds_den]);

  function save() {
    const num = parseInt(oNum, 10);
    const den = parseInt(oDen, 10);
    if (!HEX_RE.test(duckC) || !HEX_RE.test(billC)) return;
    if (!(num > 0) || !(den > 0)) return;
    onSave({ name, duck_colour: duckC, bill_colour: billC, odds_num: num, odds_den: den });
  }

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">Duck {duck.ord}</span>
        <button
          onClick={() => onSave({ active: !duck.active })}
          disabled={busy}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${duck.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {duck.active ? 'Racing' : 'Benched'}
        </button>
      </div>
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Duck name" />
      <div className="grid grid-cols-2 gap-2">
        <ColourInput label="Body colour" value={duckC} setValue={setDuckC} swatch={duck.duck_colour} />
        <ColourInput label="Bill colour" value={billC} setValue={setBillC} swatch={duck.bill_colour} />
      </div>
      <div className="flex items-end gap-2">
        <label className="block">
          <span className="text-[11px] text-neutral-500">Odds (e.g. 10/1)</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <input className={inputCls + ' w-14 text-center'} value={oNum} onChange={(e) => setONum(e.target.value)} placeholder="10" />
            <span className="font-bold text-neutral-500">/</span>
            <input className={inputCls + ' w-14 text-center'} value={oDen} onChange={(e) => setODen(e.target.value)} placeholder="1" />
          </div>
        </label>
        <button onClick={save} disabled={busy} className="ml-auto rounded-md bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-30">
          Save
        </button>
      </div>
    </div>
  );
}

function TextRowEditor({ row, label, busy, onSave }) {
  const [text, setText] = useState(row.text ?? '');
  useEffect(() => { setText(row.text ?? ''); }, [row.text]);
  const dirty = text !== (row.text ?? '');
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">{label}</span>
        <button
          onClick={() => onSave({ active: !row.active })}
          disabled={busy}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${row.active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {row.active ? 'Active' : 'Inactive'}
        </button>
      </div>
      <div className="flex gap-2">
        <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message text" />
        <button onClick={() => onSave({ text })} disabled={busy || !dirty} className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-30">
          Save
        </button>
      </div>
    </div>
  );
}
