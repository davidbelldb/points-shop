import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function OrderConfirmationPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getOrder(id).then(setOrder).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!order) return <p className="text-sm text-neutral-500">Loading...</p>;

  const ref = order.id.slice(0, 8).toUpperCase();
  const date = new Date(order.created_at).toLocaleString();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <img
          src="/hands.gif"
          alt=""
          className="mx-auto h-20 w-20 object-contain"
          onError={(e) => {
            if (!e.currentTarget.dataset.fallback) {
              e.currentTarget.dataset.fallback = 'true';
              e.currentTarget.src = '/hands.png';
            } else {
              e.currentTarget.style.display = 'none';
            }
          }}
        />
        <h1 className="mt-3 text-2xl font-bold text-emerald-900">Order placed!</h1>
        <p className="mt-2 text-base font-medium italic text-emerald-800">
          Consider my handsy hands all over this one...
          <br />
          I can hear those metronomic clapping sounds from here.
        </p>
      </div>

      <div className="space-y-1 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Reference</span><span className="font-mono font-medium">{ref}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Status</span><span className="font-medium capitalize">{order.status}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Placed</span><span className="font-medium">{date}</span></div>
        {order.delivery_name_snapshot && (
          <div className="flex justify-between"><span className="text-neutral-500">Delivery</span><span className="font-medium">{order.delivery_name_snapshot}</span></div>
        )}
      </div>

      {order.notes && (
        <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Your note</p>
          <p className="mt-1 italic text-neutral-800">{order.notes}</p>
        </div>
      )}

      <ul className="space-y-2">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between rounded-xl border border-neutral-200 bg-white p-3 text-sm">
            <div>
              <p className="font-medium">{item.product_name}</p>
              <p className="text-neutral-500">Qty {item.qty} {'\u00d7'} {item.unit_price_points} pts</p>
            </div>
            <p className="font-semibold text-amber-700">{item.line_total_points} pts</p>
          </li>
        ))}
      </ul>

      <div className="space-y-1 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Subtotal</span>
          <span>{order.subtotal_points} pts</span>
        </div>
        {order.discount_points > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>Discount{order.discount_code_snapshot ? ` (${order.discount_code_snapshot})` : ''}</span>
            <span>{'\u2212'}{order.discount_points} pts</span>
          </div>
        )}
        {order.delivery_name_snapshot && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Delivery</span>
            <span>{order.delivery_points === 0 ? 'Free' : `+${order.delivery_points} pts`}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-neutral-100 pt-1 font-semibold">
          <span>Total</span>
          <span>{order.total_points} pts</span>
        </div>
      </div>

      <Link to="/" className="block w-full rounded-xl bg-amber-600 py-3 text-center text-sm font-semibold text-amber-900">
        Back
      </Link>
    </div>
  );
}
