import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function AdminOrdersSection() {
  const [orders, setOrders] = useState([]);

  async function load() {
    try { setOrders(await api.admin.listAllOrders()); }
    catch (e) { console.error(e); }
  }
  useEffect(() => { load(); }, []);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Orders</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">No orders yet.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => <AdminOrderRow key={o.id} order={o} onChanged={load} />)}
        </ul>
      )}
    </section>
  );
}

function AdminOrderRow({ order, onChanged }) {
  const [pendingStatus, setPendingStatus] = useState(order.status);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = pendingStatus !== order.status;

  async function apply() {
    if (!dirty) return;
    setBusy(true);
    try {
      await api.admin.updateOrderStatus(order.id, pendingStatus, reason.trim() || null);
      setReason('');
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  function cancelPending() {
    setPendingStatus(order.status);
    setReason('');
  }

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-neutral-500">#{order.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-neutral-500">{new Date(order.created_at).toLocaleString()}</p>
          <p className="truncate text-xs text-neutral-500">
            {order.item_count} item{order.item_count == 1 ? '' : 's'}
            {order.delivery_name_snapshot ? ` \u00b7 ${order.delivery_name_snapshot}` : ''}
            {order.discount_code_snapshot ? ` \u00b7 ${order.discount_code_snapshot}` : ''}
          </p>
          {order.notes && <p className="mt-1 italic text-xs text-neutral-700">"{order.notes}"</p>}
        </div>
        <p className="shrink-0 font-semibold text-amber-700">{order.total_points} pts</p>
      </div>
      <select
        value={pendingStatus}
        onChange={(e) => setPendingStatus(e.target.value)}
        disabled={busy}
        className="mt-2 block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
      >
        <option value="placed">Placed</option>
        <option value="dispatched">Dispatched</option>
        <option value="delivered">Delivered</option>
        <option value="cancelled">Cancelled</option>
        <option value="deleted">Deleted</option>
      </select>
      {dirty && (
        <div className="mt-2 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional note for Katie (e.g. why this changed)..."
            rows={2}
            className="block w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={cancelPending} disabled={busy} className="text-sm text-neutral-500">Cancel</button>
            <button onClick={apply} disabled={busy} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40">
              {busy ? 'Saving...' : 'Save & notify Katie'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
