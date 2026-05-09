import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatLedgerReason } from '../lib/formatters.js';

export default function PointsHistoryPage() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.getLedgerAdjustments(100).then(setItems).catch(console.error);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Awarded points</h1>
        <Link to="/account" className="text-sm text-neutral-500">Back</Link>
      </div>
      {!items ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">No adjustments yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <div>
                <p className="font-medium">{formatLedgerReason(a.reason)}</p>
                <p className="text-xs text-neutral-500">{new Date(a.created_at).toLocaleString()}</p>
              </div>
              <p className={`font-semibold ${a.delta > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {a.delta > 0 ? '+' : ''}{a.delta} pts
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
