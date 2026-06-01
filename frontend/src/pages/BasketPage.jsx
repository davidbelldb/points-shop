import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

export default function BasketPage() {
  const { basket, account, setItemQty, removeItem, applyPromo, removePromo, setDelivery, setNotes, placeOrder } = useBasket();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [deliveryOptions, setDeliveryOptions] = useState([]);
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    api.getDeliveryOptions().then(setDeliveryOptions).catch(console.error);
  }, []);

  useEffect(() => {
    setNotesDraft(basket?.notes ?? '');
  }, [basket?.notes]);

  if (!basket) return <p className="text-sm text-neutral-500">Loading...</p>;

  if (basket.items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Katie's safe pocket</h1>
        <p className="text-sm text-neutral-500">Oh look. It's empty. Better put something in it.</p>
        <Link to="/" className="inline-block rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-amber-900">
          Back to shop
        </Link>
      </div>
    );
  }

  const balance = account?.points_balance ?? 0;
  const canAfford = balance >= basket.total_points;

  async function handleApply() {
    if (!code.trim()) return;
    setBusy(true); setError(null);
    try { await applyPromo(code.trim()); setCode(''); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function handleRemovePromo() {
    setBusy(true); setError(null);
    try { await removePromo(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function handleSetDelivery(id) {
    setBusy(true); setError(null);
    try { await setDelivery(id); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function handleNotesBlur() {
    const current = basket?.notes ?? '';
    if (notesDraft.trim() !== current.trim()) {
      try { await setNotes(notesDraft); } catch (e) { setError(e.message); }
    }
  }
  async function handlePlace() {
    if (!canAfford || placing) return;
    setPlacing(true); setError(null);
    try {
      const current = basket?.notes ?? '';
      if (notesDraft.trim() !== current.trim()) {
        await setNotes(notesDraft);
      }
      const order = await placeOrder();
      navigate(`/order/${order.id}`);
    }
    catch (e) { setError(e.message); }
    finally { setPlacing(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Katie's safe pocket</h1>

      {/* \u2500\u2500 Responsive two-column layout \u2500\u2500
          Mobile  : flex-col \u2014 items first, then summary (current order preserved).
          Tablet+ : CSS grid \u2014 items on left, sticky order summary on right. */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_300px] md:items-start md:gap-6">

        {/* LEFT \u2014 basket items + note */}
        <div className="space-y-4 md:col-start-1 md:row-start-1">
          <ul className="space-y-2">
            {basket.items.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-400">
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium leading-tight">{item.name}</h3>
                      <button onClick={() => removeItem(item.product_id)} className="text-xs text-neutral-400 hover:text-red-600">
                        Remove
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-amber-700">{item.price_points} pts</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setItemQty(item.product_id, item.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-base"
                      aria-label="Decrease quantity"
                    >{'\u2212'}</button>
                    <span className="min-w-6 text-center text-sm font-medium">{item.qty}</span>
                    <button
                      onClick={() => setItemQty(item.product_id, item.qty + 1)}
                      disabled={item.qty >= item.stock_qty}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-base disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Increase quantity"
                    >+</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <label className="mb-1 block text-sm font-semibold">Note (optional)</label>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Just remember to keep it clean. No room for filth here"
              rows={2}
              className="block w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* RIGHT \u2014 delivery, discount, totals, place order */}
        <div className="space-y-4 md:col-start-2 md:row-start-1">
          <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-sm font-semibold">Delivery</p>
            <div className="space-y-1">
              {deliveryOptions.map((opt) => (
                <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-neutral-50">
                  <input
                    type="radio"
                    name="delivery"
                    checked={basket.delivery?.id === opt.id}
                    onChange={() => handleSetDelivery(opt.id)}
                    disabled={busy}
                    className="h-4 w-4 accent-[#106655]"
                  />
                  <span className="flex-1">{opt.name}</span>
                  <span className="font-medium text-amber-700">
                    {opt.points === 0 ? 'Free' : `+${opt.points} pts`}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {basket.discount ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div>
                <p className="font-semibold text-emerald-900">{basket.discount.code} applied</p>
                {basket.discount.description && (
                  <p className="text-xs text-emerald-700">{basket.discount.description}</p>
                )}
              </div>
              <button onClick={handleRemovePromo} disabled={busy} className="text-xs font-medium text-emerald-800 hover:text-red-600">
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Discount code"
                className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={handleApply}
                disabled={busy || !code.trim()}
                className="shrink-0 rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          )}

          <div className="space-y-1 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Subtotal</span>
              <span>{basket.subtotal_points} pts</span>
            </div>
            {basket.discount_points > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>{'\u2212'}{basket.discount_points} pts</span>
              </div>
            )}
            {basket.delivery && (
              <div className="flex justify-between">
                <span className="text-neutral-500">Delivery</span>
                <span>{basket.delivery_points === 0 ? 'Free' : `+${basket.delivery_points} pts`}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-100 pt-1 font-semibold">
              <span>Total</span>
              <span>{basket.total_points} pts</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Your balance</span>
              <span className={canAfford ? 'font-medium' : 'font-medium text-red-600'}>
                {balance.toLocaleString()} pts
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <button
            disabled={!canAfford || placing}
            onClick={handlePlace}
            className="w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-amber-900 shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {placing ? 'Placing order...' : canAfford ? 'Place order' : "You're a bit too poor for that. Pauper."}
          </button>
        </div>

      </div>
    </div>
  );
}
