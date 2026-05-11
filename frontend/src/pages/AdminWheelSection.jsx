import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const AWARD_TYPES = [
  { value: 'label',   label: 'Just text (no effect)' },
  { value: 'points',  label: 'Points (+/-)' },
  { value: 'product', label: 'Product reward' },
  { value: 'forfeit', label: 'Forfeit' },
];

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

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })}
               className="h-9 w-12 shrink-0 cursor-pointer rounded border border-neutral-200" />
        <input type="text" value={draft.label} onChange={(e) => set({ label: e.target.value })}
               placeholder="Segment label" className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
        <button onClick={() => onDelete(seg.id)} disabled={busy}
                className="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-500">Remove</button>
      </div>
      <div className="flex items-center gap-2">
        <select value={draft.award_type} onChange={(e) => set({ award_type: e.target.value })}
                className="block w-44 shrink-0 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none">
          {AWARD_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        {draft.award_type === 'points' && (
          <input type="number" value={draft.points_delta} onChange={(e) => set({ points_delta: e.target.value })}
                 placeholder="e.g. -3 or +10"
                 className="block w-32 shrink-0 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
        )}
        {draft.award_type === 'product' && (
          <select value={draft.product_id} onChange={(e) => set({ product_id: e.target.value })}
                  className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none">
            <option value="">Pick a product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {draft.award_type === 'forfeit' && (
          <input type="text" value={draft.forfeit_text} onChange={(e) => set({ forfeit_text: e.target.value })}
                 placeholder="Forfeit description"
                 className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
        )}
        <button onClick={save} disabled={!dirty || busy}
                className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40">Save</button>
      </div>
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

  if (!data) return null;
  const segments = data.segments || [];

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Wheel of Misfortune</h2>
        <span className="text-xs text-neutral-400">/games/wheel-of-misfortune</span>
      </div>
      <p className="text-xs text-neutral-500">Configure 2+ segments. Award types: label (no effect), points (+/-), product, or forfeit. Segments are revealed in clockwise order on the wheel.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
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
