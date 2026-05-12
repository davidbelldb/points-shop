import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const AWARD_TYPES = [
  { value: 'label',   label: 'Just text (no effect)' },
  { value: 'points',  label: 'Points (+/-)' },
  { value: 'product', label: 'Product reward' },
  { value: 'forfeit', label: 'Forfeit' },
];
const DAYS = [
  { value: 'mon', label: 'Mon' }, { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' }, { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' }, { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

function HomepageSettings({ wheel, onSave, busy }) {
  const [draft, setDraft] = useState({
    spin_label:        wheel.spin_label || '',
    peg_color:         wheel.peg_color || '#0f172a',
    text_color:        wheel.text_color || '#ffffff',
    homepage_visible:  !!wheel.homepage_visible,
    homepage_title:    wheel.homepage_title    || '',
    homepage_subtitle: wheel.homepage_subtitle || '',
    homepage_days:     wheel.homepage_days     || [],
    homepage_start_time: wheel.homepage_start_time ? String(wheel.homepage_start_time).slice(0,5) : '',
    homepage_end_time:   wheel.homepage_end_time   ? String(wheel.homepage_end_time).slice(0,5)   : '',
  });
  const [dirty, setDirty] = useState(false);

  function set(patch) { setDraft((d) => ({ ...d, ...patch })); setDirty(true); }
  function toggleDay(d) {
    setDraft((prev) => {
      const has = prev.homepage_days.includes(d);
      return { ...prev, homepage_days: has ? prev.homepage_days.filter((x) => x !== d) : [...prev.homepage_days, d] };
    });
    setDirty(true);
  }
  async function save() {
    await onSave({
      spin_label:          draft.spin_label.trim() || null,
      peg_color:           draft.peg_color || null,
      text_color:          draft.text_color || null,
      homepage_visible:    draft.homepage_visible,
      homepage_title:      draft.homepage_title.trim()    || null,
      homepage_subtitle:   draft.homepage_subtitle.trim() || null,
      homepage_days:       draft.homepage_days,
      homepage_start_time: draft.homepage_start_time || null,
      homepage_end_time:   draft.homepage_end_time   || null,
    });
    setDirty(false);
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-sm font-semibold">Wheel settings</p>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Centre button label</label>
        <input type="text" value={draft.spin_label}
          onChange={(e) => set({ spin_label: e.target.value })}
          placeholder="SPIN"
          className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
      </div>
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">Peg colour</label>
        <input type="color" value={draft.peg_color}
          onChange={(e) => set({ peg_color: e.target.value })}
          className="h-9 w-12 shrink-0 cursor-pointer rounded border border-neutral-200" />
        <span className="text-xs text-neutral-400">Colour of the dots around the rim</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">Segment text</label>
        <input type="color" value={draft.text_color}
          onChange={(e) => set({ text_color: e.target.value })}
          className="h-9 w-12 shrink-0 cursor-pointer rounded border border-neutral-200" />
        <span className="text-xs text-neutral-400">Colour of segment labels</span>
      </div>
      <p className="text-sm font-semibold pt-1">Home page placement</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.homepage_visible} onChange={(e) => set({ homepage_visible: e.target.checked })} />
        Show on home page
      </label>
      <input type="text" value={draft.homepage_title}
        onChange={(e) => set({ homepage_title: e.target.value })}
        placeholder="Home page title"
        className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
      <input type="text" value={draft.homepage_subtitle}
        onChange={(e) => set({ homepage_subtitle: e.target.value })}
        placeholder="Home page subtitle (optional)"
        className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Days (empty = every day)</p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                draft.homepage_days.includes(d.value)
                  ? 'border-amber-500 bg-amber-100 text-amber-900'
                  : 'border-neutral-200 bg-white text-neutral-500'
              }`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-xs font-medium text-neutral-500">Start</label>
        <input type="time" value={draft.homepage_start_time}
          onChange={(e) => set({ homepage_start_time: e.target.value })}
          className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
        <label className="shrink-0 text-xs font-medium text-neutral-500">End</label>
        <input type="time" value={draft.homepage_end_time}
          onChange={(e) => set({ homepage_end_time: e.target.value })}
          className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
      </div>
      <p className="text-xs text-neutral-400">Times use your local clock. Leave both blank for 24-hour visibility on selected days.</p>
      <button onClick={save} disabled={!dirty || busy}
              className="w-full rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40">
        Save homepage settings
      </button>
    </div>
  );
}

function SegmentRow({ seg, products, onSave, onDelete, busy }) {
  const [draft, setDraft] = useState({
    label: seg.label || '',
    color: seg.color || '#14b8a6',
    award_type: seg.award_type || 'label',
    product_id: seg.product_id || '',
    points_delta: seg.points_delta ?? '',
    forfeit_text: seg.forfeit_text || '',
  });
  const [dirty, setDirty] = useState(false);

  function set(patch) { setDraft((d) => ({ ...d, ...patch })); setDirty(true); }

  function save() {
    const payload = {
      label: draft.label.trim() || 'Segment',
      color: draft.color,
      award_type: draft.award_type,
      product_id: draft.award_type === 'product' ? (draft.product_id || null) : null,
      points_delta: draft.award_type === 'points' && draft.points_delta !== '' ? parseInt(draft.points_delta, 10) : null,
      forfeit_text: draft.award_type === 'forfeit' ? (draft.forfeit_text.trim() || null) : null,
    };
    onSave(seg.id, payload).then(() => setDirty(false));
  }

  // In-stock + currently-selected product
  const productOptions = (products || []).filter((p) =>
    (p.stock_qty || 0) > 0 || p.id === draft.product_id
  );

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })}
               className="h-10 w-12 shrink-0 cursor-pointer rounded border border-neutral-200" />
        <input type="text" value={draft.label} onChange={(e) => set({ label: e.target.value })}
               placeholder="Display label (short)"
               className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
        <button onClick={() => onDelete(seg.id)} disabled={busy}
                className="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-500">Remove</button>
      </div>
      <select value={draft.award_type} onChange={(e) => set({ award_type: e.target.value })}
              className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none">
        {AWARD_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
      {draft.award_type === 'points' && (
        <input type="number" value={draft.points_delta} onChange={(e) => set({ points_delta: e.target.value })}
               placeholder="Points delta (e.g. -3 or +10)"
               className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
      )}
      {draft.award_type === 'product' && (
        <>
          <select value={draft.product_id} onChange={(e) => set({ product_id: e.target.value })}
                  className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none">
            <option value="">Pick a product (in stock only)</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{(p.stock_qty || 0) === 0 ? ' (out of stock)' : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-neutral-400">The wheel shows the short label above. The win modal shows the product's full name.</p>
        </>
      )}
      {draft.award_type === 'forfeit' && (
        <input type="text" value={draft.forfeit_text} onChange={(e) => set({ forfeit_text: e.target.value })}
               placeholder="Forfeit description"
               className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
      )}
      <button onClick={save} disabled={!dirty || busy}
              className="w-full rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40">
        Save segment
      </button>
    </div>
  );
}

export default function AdminWheelSection() {
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [d, p] = await Promise.all([api.admin.getWheel(), api.admin.listProducts()]);
      setData(d); setProducts(p);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function addSegment() {
    setBusy(true);
    try {
      await api.admin.addWheelSegment({
        label: `Segment ${(data?.segments?.length || 0) + 1}`,
        color: '#14b8a6',
        award_type: 'label',
        order_index: (data?.segments?.length || 0),
      });
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveSegment(id, patch) {
    setBusy(true);
    try { await api.admin.updateWheelSegment(id, patch); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function deleteSegment(id) {
    if (!confirm('Remove this segment?')) return;
    setBusy(true);
    try { await api.admin.deleteWheelSegment(id); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveHomepage(patch) {
    setBusy(true);
    try { await api.admin.updateWheel(patch); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!data) return null;
  const segments = data.segments || [];

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Wheel of Misfortune</h2>
        <span className="text-xs text-neutral-400">/games/wheel-of-misfortune</span>
      </div>
      <p className="text-xs text-neutral-500">Add 2+ segments. Each segment can be a no-effect label, a points adjustment, a product reward, or a forfeit.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data.wheel && <HomepageSettings wheel={data.wheel} onSave={saveHomepage} busy={busy} />}

      {segments.length === 0 ? (
        <p className="text-sm text-neutral-400">No segments yet. Add at least two to make the wheel spinnable.</p>
      ) : (
        <div className="space-y-2">
          {segments.map((s) => (
            <SegmentRow key={s.id} seg={s} products={products} onSave={saveSegment} onDelete={deleteSegment} busy={busy} />
          ))}
        </div>
      )}
      <button onClick={addSegment} disabled={busy}
              className="w-full rounded-md border border-dashed border-neutral-300 bg-white py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
        + Add segment
      </button>
    </section>
  );
}
