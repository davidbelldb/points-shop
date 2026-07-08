import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

// Admin editor for Plinko: play cost, peg rows, and the prize in each bottom
// slot (product / free-text experience / blank) plus its landing weight.
const input = 'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800';

function resize(slots, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(slots[i] ?? { slot_index: i, prize_kind: 'none', product_id: null, text_label: '', label: '', weight: 1 });
    out[i].slot_index = i;
  }
  return out;
}

export default function AdminPlinkoSection() {
  const [cost, setCost]       = useState(100);
  const [rows, setRows]       = useState(12);
  const [slots, setSlots]     = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, prods] = await Promise.all([api.admin.plinkoGet(), api.admin.listProducts()]);
      setCost(cfg.cost_per_play); setRows(cfg.peg_rows);
      setSlots(resize(cfg.slots.map(s => ({
        slot_index: s.slot_index, prize_kind: s.prize_kind || 'none',
        product_id: s.product_id || null, text_label: s.text_label || '',
        label: s.label || '', weight: s.weight ?? 1,
      })), cfg.slot_count));
      setProducts(prods || []);
    } catch (e) { setMsg(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Keep slot count in sync with peg rows (+1) as the admin edits it.
  useEffect(() => { setSlots((s) => resize(s, rows + 1)); }, [rows]);

  function patch(i, key, val) {
    setSlots((s) => s.map((slot, idx) => idx === i ? { ...slot, [key]: val } : slot));
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await api.admin.plinkoSettings({ cost_per_play: Number(cost), peg_rows: Number(rows) });
      await api.admin.plinkoSlots(slots);
      setMsg('Saved.');
    } catch (e) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <Link to="/plinko" className="inline-block rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
        style={{ background: '#ee70bd' }}>
        Open the Plinko board →
      </Link>

      <div className="flex flex-wrap gap-4">
        <label className="text-sm">Cost per play (pts)
          <input type="number" min="0" className={`${input} ml-2 w-24`} value={cost}
            onChange={(e) => setCost(e.target.value)} />
        </label>
        <label className="text-sm">Peg rows (4–20)
          <input type="number" min="4" max="20" className={`${input} ml-2 w-20`} value={rows}
            onChange={(e) => setRows(Math.max(4, Math.min(20, Number(e.target.value) || 4)))} />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Bottom slots ({slots.length}) — left → right</p>
        {slots.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
            <span className="w-6 text-center text-xs font-bold text-neutral-400">{i}</span>
            <select className={input} value={s.prize_kind} onChange={(e) => patch(i, 'prize_kind', e.target.value)}>
              <option value="none">Blank</option>
              <option value="product">Product</option>
              <option value="experience">Experience</option>
            </select>
            {s.prize_kind === 'product' && (
              <select className={`${input} min-w-40`} value={s.product_id || ''} onChange={(e) => patch(i, 'product_id', e.target.value || null)}>
                <option value="">— pick product —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {s.prize_kind === 'experience' && (
              <input className={`${input} min-w-48 flex-1`} placeholder="Experience (free text)"
                value={s.text_label} onChange={(e) => patch(i, 'text_label', e.target.value)} />
            )}
            <input className={`${input} w-28`} placeholder="Bar label" value={s.label}
              onChange={(e) => patch(i, 'label', e.target.value)} />
            <label className="text-xs text-neutral-500">wt
              <input type="number" min="0" className={`${input} ml-1 w-16`} value={s.weight}
                onChange={(e) => patch(i, 'weight', Math.max(0, Number(e.target.value) || 0))} />
            </label>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#61dbbb', color: '#0d3d2e' }}>
          {saving ? 'Saving…' : 'Save Plinko config'}
        </button>
        {msg && <span className="text-sm text-neutral-500">{msg}</span>}
      </div>
      <p className="text-xs text-neutral-400">Weight = relative landing chance (higher = more likely). Set rare prizes low.</p>
    </div>
  );
}
