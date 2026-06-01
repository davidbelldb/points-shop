import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { formatLedgerReason } from '../lib/formatters.js';
import GameRewardsCard from '../components/GameRewardsCard.jsx';
import PushToggle from '../components/PushToggle.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import Confetti from '../components/Confetti.jsx';
import { useSettings } from '../lib/SettingsContext.jsx';
import { daysUntil } from '../lib/countdown.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

export default function AccountPage() {
  const { account, refresh, notifications, markNotificationsRead, dismissNotification, clearAllNotifications } = useBasket();
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const [editing, setEditing] = useState(false);
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  const [openOrders,  setOpenOrders]  = useState(null);
  const [pastOrders,  setPastOrders]  = useState(null);
  const [adjustments, setAdjustments] = useState(null);

  useEffect(() => {
    if (account) { setName(account.name); setEmail(account.email); }
  }, [account?.id]);

  useEffect(() => {
    api.listOrders('open', 3).then(setOpenOrders).catch(console.error);
    api.listOrders('past', 3).then(setPastOrders).catch(console.error);
    api.getLedgerAdjustments(3).then(setAdjustments).catch(console.error);
    markNotificationsRead().catch(console.error);
  }, []);

  if (!account) return <p className="text-sm text-neutral-500">Loading...</p>;

  async function saveProfile() {
    setBusy(true); setError(null);
    try { await api.updateAccount({ name, email }); await refresh(); setEditing(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const { url } = await api.upload(file);
      await api.updateAccount({ photo_url: url });
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      {daysUntil(settings.banner_countdown_date) === 0 && <Confetti />}

      {/* Page title \u2014 always full width */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your account</h1>
        <Link to="/" className="text-sm text-neutral-500">Back to shop</Link>
      </div>

      {/* \u2500\u2500 Responsive two-column layout \u2500\u2500
          Mobile  : flex-col, right col (activity) stacks after left col (profile).
          Tablet+ : CSS grid side-by-side. */}
      <div className="flex flex-col gap-5 md:grid md:grid-cols-2 md:items-start md:gap-6">

        {/* LEFT column \u2014 profile, settings, quick links */}
        <div className="space-y-4 md:col-start-1 md:row-start-1">
          {user && (
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p>Signed in as <span className="font-semibold">{user.username}</span></p>
              <button onClick={logout} className="font-medium text-amber-700 hover:text-red-600">Sign out</button>
            </div>
          )}

          <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <label className="relative cursor-pointer">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400">
                  {account.photo_url ? (
                    <img src={account.photo_url} alt={account.name} className="h-full w-full object-cover" />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21a8 8 0 0 1 16 0" />
                    </svg>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-xs font-semibold text-amber-900">+</span>
              </label>
              <div className="flex-1">
                {editing ? (
                  <div className="space-y-1">
                    <input className={inputCls} value={name}  onChange={(e) => setName(e.target.value)}  placeholder="Name" />
                    <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
                  </div>
                ) : (
                  <>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-xs text-neutral-500">{account.email}</p>
                  </>
                )}
              </div>
              {editing ? (
                <button onClick={saveProfile} disabled={busy} className="text-sm font-semibold text-amber-700 disabled:opacity-50">Save</button>
              ) : (
                <button onClick={() => setEditing(true)} className="text-sm text-neutral-500">Edit</button>
              )}
            </div>

            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs uppercase tracking-wide text-amber-800">Balance</p>
              <p className="text-2xl font-semibold text-amber-900">{account.points_balance.toLocaleString()} pts</p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </section>

          <Link
            to="/messages"
            className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-700">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">Chat</p>
                <p className="text-xs text-neutral-500">Because, why not?</p>
              </div>
            </div>
            <span className="text-neutral-400">{'\u2192'}</span>
          </Link>

          <Link
            to="/rewatch"
            className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="m10 8 5 3-5 3V8z" />
                  <path d="M7 21h10" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">{account.name}&apos;s watch list</p>
                <p className="text-xs text-neutral-500">2026 watch list, innit.</p>
              </div>
            </div>
            <span className="text-neutral-400">{'\u2192'}</span>
          </Link>

          <PushToggle />

          <section className="rounded-2xl border border-neutral-200 bg-white p-2">
            <ThemeToggle />
          </section>
        </div>

        {/* RIGHT column \u2014 activity feed, orders, rewards */}
        <div className="space-y-4 md:col-start-2 md:row-start-1">
          <UpdatesSection notifications={notifications?.items ?? []} onDismiss={dismissNotification} onClearAll={clearAllNotifications} />
          <OrdersSection title="Current orders" bucket="open" orders={openOrders} />
          <OrdersSection title="Past orders"    bucket="past" orders={pastOrders} />
          <GameRewardsCard />
          <AdjustmentsSection adjustments={adjustments} />
        </div>

      </div>
    </div>
  );
}

function OrdersSection({ title, bucket, orders }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <Link to={`/account/orders?bucket=${bucket}`} className="text-xs font-medium text-amber-700">See all</Link>
      </div>
      {orders === null ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-neutral-500">{bucket === 'open' ? "What's the matter, too poor?" : "Who even are you?"}</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => <OrderRow key={o.id} order={o} />)}
        </ul>
      )}
    </section>
  );
}

function OrderRow({ order }) {
  const ref = order.id.slice(0, 8).toUpperCase();
  return (
    <li>
      <Link to={`/order/${order.id}`} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3 text-sm hover:shadow-sm">
        <div>
          <p className="font-mono text-xs text-neutral-500">#{ref}</p>
          <p className="font-medium capitalize">{order.status}</p>
          <p className="text-xs text-neutral-500">{new Date(order.created_at).toLocaleString()}</p>
        </div>
        <p className="font-semibold text-amber-700">{order.total_points} pts</p>
      </Link>
    </li>
  );
}

function AdjustmentsSection({ adjustments }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Recent sneaky transactions</h2>
        <Link to="/account/points" className="text-xs font-medium text-amber-700">See all</Link>
      </div>
      {adjustments === null ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : adjustments.length === 0 ? (
        <p className="text-sm text-neutral-500">No adjustments yet.</p>
      ) : (
        <ul className="space-y-2">
          {adjustments.map((a) => (
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
    </section>
  );
}


function UpdatesSection({ notifications, onDismiss, onClearAll }) {
  if (!notifications || notifications.length === 0) return null;
  function handleClearAll() {
    if (!confirm('Clear all updates?')) return;
    onClearAll().catch(console.error);
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Updates</h2>
        <button onClick={handleClearAll} className="text-xs font-medium text-neutral-500 hover:text-red-600">
          Clear all
        </button>
      </div>
      <ul className="space-y-2">
        {notifications.slice(0, 10).map((n) => (
          <UpdateRow key={n.id} notification={n} onDismiss={() => onDismiss(n.id)} />
        ))}
      </ul>
    </section>
  );
}

function UpdateRow({ notification: n, onDismiss }) {
  const date = new Date(n.created_at).toLocaleString();
  const inner = (
    <div className="pr-7">
      <p className="text-sm font-medium">{n.title}</p>
      {n.body && <p className="mt-1 text-xs text-neutral-600">{n.body}</p>}
      <p className="mt-1 text-xs text-neutral-500">{date}</p>
    </div>
  );
  return (
    <li className="relative">
      {n.link_url ? (
        <Link to={n.link_url} className="block rounded-xl border border-neutral-200 bg-white p-3 hover:shadow-sm">
          {inner}
        </Link>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-3">{inner}</div>
      )}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
        aria-label="Dismiss"
      >
        ×
      </button>
    </li>
  );
}

