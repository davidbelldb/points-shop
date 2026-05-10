import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function GameRewardsCard() {
  const [rewards, setRewards] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    try { setRewards(await api.listRewards()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function claim(id) {
    if (!confirm('Claim this reward?')) return;
    setBusy(true);
    try { await api.claimReward(id); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (rewards === null) return null;
  if (rewards.length === 0) return null;
  const pending = rewards.filter((r) => r.status === 'pending');
  const claimed = rewards.filter((r) => r.status === 'claimed');

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Game rewards</h2>
        {pending.length > 0 && <span className="text-xs font-medium text-teal-700">{pending.length} to claim</span>}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {pending.length > 0 ? (
        <ul className="space-y-2">
          {pending.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
              {r.product_thumbnail
                ? <img src={r.product_thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-emerald-200 text-xl">{r.product_id ? '\uD83C\uDF81' : '\uD83D\uDCDD'}</div>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-teal-900">
                  {r.product_id ? r.product_name : r.text_label}
                </p>
                <p className="text-xs text-teal-700">
                  {r.product_id ? 'Product - free to claim' : 'Forfeit - mark when redeemed'}
                </p>
              </div>
              <button onClick={() => claim(r.id)} disabled={busy}
                className="shrink-0 rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40">
                {r.product_id ? 'Claim' : 'Redeem'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-400">All caught up.</p>
      )}
      {claimed.length > 0 && (
        <details className="rounded-xl border border-neutral-200 bg-white p-3">
          <summary className="cursor-pointer text-xs font-medium text-neutral-500">{claimed.length} previously claimed</summary>
          <ul className="mt-2 space-y-1.5">
            {claimed.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-xs text-neutral-500">
                <span className="flex-1 truncate font-medium text-neutral-700">{r.product_id ? r.product_name : r.text_label}</span>
                <span>{r.claimed_at ? new Date(r.claimed_at).toLocaleDateString() : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
