import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import Pressable from '../components/Pressable.jsx';

export default function OrdersListPage() {
  const [params] = useSearchParams();
  const bucket = params.get('bucket') ?? 'all';
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.listOrders(bucket, 100).then(setOrders).catch(console.error);
  }, [bucket]);

  const title = bucket === 'open' ? 'Current orders' : bucket === 'past' ? 'Past orders' : 'All orders';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <Pressable as={Link} to="/account" className="text-sm text-neutral-500">Back</Pressable>
      </div>
      {!orders ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-neutral-500">None yet.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => {
            const ref = o.id.slice(0, 8).toUpperCase();
            return (
              <li key={o.id}>
                <Pressable as={Link} to={`/order/${o.id}`} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3 text-sm hover:shadow-sm">
                  <div>
                    <p className="font-mono text-xs text-neutral-500">#{ref}</p>
                    <p className="font-medium capitalize">{o.status}</p>
                    <p className="text-xs text-neutral-500">{new Date(o.created_at).toLocaleString()}</p>
                  </div>
                  <p className="font-semibold text-amber-700">{o.total_points} pts</p>
                </Pressable>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
