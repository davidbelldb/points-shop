import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatLedgerReason } from '../lib/formatters.js';

export default function PointsHistoryPage() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    try { setItems(await api.getLedgerAdjustments(100)); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function dismiss(id) {
    if (!confirm('Remove this entry from your history? (Your points balance will not change.)')) return;
    setBusy(true); setError(null);
    try { await api.deleteLedgerEntry(id); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Awarded points</h1>
        <Link to="/account" className="text-sm text-neutral-500">Back</Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!items ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">No adjustments yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="relative flex items-start justify-between rounded-xl border border-neutral-200 bg-white p-3 pr-9 text-sm">
              <div className="min-w-0 pr-2">
                <p className="truncate font-medium">{formatLedgerReason(a.reason)}</p>
                <p className="text-xs text-neutral-500">{new Date(a.created_at).toLocaleString()}</p>
              </div>
              <p className={`shrink-0 font-semibold ${a.delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {a.delta > 0 ? '+' : ''}{a.delta} pts
              </p>
              <button
                onClick={() => dismiss(a.id)}
                disabled={busy}
                aria-label="Remove from history"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-red-600 disabled:opacity-30"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
