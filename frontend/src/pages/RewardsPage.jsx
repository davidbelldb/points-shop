import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function RewardsPage() {
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

  if (rewards === null) return <div className="py-6 text-center text-sm text-neutral-500">Loading...</div>;
  const pending = rewards.filter((r) => r.status === 'pending');
  const claimed = rewards.filter((r) => r.status === 'claimed');

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <Link to="/account" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Game rewards</h1>
        <span className="w-12" />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">To claim ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing pending. Win some games!</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
                {r.product_id ? (
                  r.product_thumbnail
                    ? <img src={r.product_thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                    : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-emerald-200 text-2xl">{'\uD83C\uDF81'}</div>
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-pink-100">
                    <img src="/sphincter-pink.svg" alt="" className="h-10 w-10" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-teal-900">
                    {r.product_id ? r.product_name : r.text_label}
                  </p>
                  <p className="text-xs text-teal-700">{r.product_id ? 'Product - free to claim' : 'Forfeit - mark when redeemed'}</p>
                  <p className="mt-1 text-[11px] text-neutral-500">Won {new Date(r.created_at).toLocaleString()}</p>
                </div>
                <button onClick={() => claim(r.id)} disabled={busy}
                  className="shrink-0 rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40">
                  {r.product_id ? 'Claim' : 'Redeem'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {claimed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Previously claimed ({claimed.length})</h2>
          <ul className="space-y-2">
            {claimed.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                {r.product_id ? (
                  r.product_thumbnail
                    ? <img src={r.product_thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover opacity-70" />
                    : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xl">{'\uD83C\uDF81'}</div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-pink-50 opacity-70">
                    <img src="/sphincter-pink.svg" alt="" className="h-8 w-8" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-700">{r.product_id ? r.product_name : r.text_label}</p>
                  <p className="text-xs text-neutral-500">Claimed {r.claimed_at ? new Date(r.claimed_at).toLocaleString() : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
