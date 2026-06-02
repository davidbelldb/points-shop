import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const SWIPE_RIGHT_THRESHOLD = 60;

export default function BasketDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const { basket, account, setItemQty, removeItem, applyPromo, removePromo, setDelivery, setNotes, placeOrder } = useBasket();

  const [placing,         setPlacing]         = useState(false);
  const [code,            setCode]             = useState('');
  const [busy,            setBusy]             = useState(false);
  const [error,           setError]            = useState(null);
  const [deliveryOptions, setDeliveryOptions]  = useState([]);
  const [notesDraft,      setNotesDraft]       = useState('');

  useEffect(() => { api.getDeliveryOptions().then(setDeliveryOptions).catch(console.error); }, []);
  useEffect(() => { setNotesDraft(basket?.notes ?? ''); }, [basket?.notes]);

  /* ── Keyboard close ── */
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* ── Swipe RIGHT to dismiss ── */
  useEffect(() => {
    if (!open) return;
    let startX = null;
    function onTouchStart(e) { startX = e.touches?.[0]?.clientX ?? null; }
    function onTouchEnd(e) {
      if (startX == null) return;
      const endX = e.changedTouches?.[0]?.clientX ?? null;
      if (endX != null && endX - startX > SWIPE_RIGHT_THRESHOLD) onClose();
      startX = null;
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend',   onTouchEnd);
    };
  }, [open, onClose]);

  /* ── Prevent body scroll while open ── */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  /* ── Basket actions ── */
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
      if (notesDraft.trim() !== current.trim()) await setNotes(notesDraft);
      const order = await placeOrder();
      onClose();
      navigate(`/order/${order.id}`);
    } catch (e) { setError(e.message); }
    finally { setPlacing(false); }
  }

  const balance   = account?.points_balance ?? 0;
  const canAfford = basket ? balance >= basket.total_points : false;
  const isEmpty   = !basket || basket.items.length === 0;

  return (
    <div
      className={`fixed inset-0 md:left-56 z-40 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Panel — slides in from the right */}
      <aside
        style={{ backgroundColor: '#7d3c6b' }}
        className={`absolute right-0 top-0 flex h-full w-[80vw] md:w-full md:max-w-md flex-col shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* ── Drawer header ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <img src="/sphincter-pink.svg" alt="" className="h-5 w-5" />
            {isEmpty ? "Katie's safe pocket" : `Katie's safe pocket (${basket.items.length})`}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close safe pocket"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Loading ── */}
        {!basket && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-500">Loading...</p>
          </div>
        )}

        {/* ── Empty state ── */}
        {basket && isEmpty && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex items-center justify-center">
              <img src="/sphincter-pink.svg" alt="" className="h-16 w-16" />
            </div>
            <div>
              <p className="font-semibold text-neutral-900">It's looking remarkably clean up in here</p>
              <p className="mt-1 text-sm text-neutral-500">Probably the perfect time to put occupy it with something...</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-amber-900"
            >
              Close safe pocket
            </button>
          </div>
        )}

        {/* ── Items + options (scrollable) ── */}
        {basket && !isEmpty && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

              {/* Items */}
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
                          <button onClick={() => removeItem(item.product_id)} className="text-xs text-neutral-400 hover:text-red-600">Remove</button>
                        </div>
                        <p className="text-sm font-semibold text-amber-700">{item.price_points} pts</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setItemQty(item.product_id, item.qty - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-base"
                          aria-label="Decrease">−</button>
                        <span className="min-w-6 text-center text-sm font-medium">{item.qty}</span>
                        <button onClick={() => setItemQty(item.product_id, item.qty + 1)}
                          disabled={item.qty >= item.stock_qty}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 text-base disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Increase">+</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Delivery */}
              {deliveryOptions.length > 0 && (
                <section className="space-y-1 rounded-xl border border-neutral-200 bg-white p-3">
                  <p className="text-sm font-semibold">Delivery</p>
                  {deliveryOptions.map((opt) => (
                    <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-neutral-50">
                      <input type="radio" name="drawer-delivery"
                        checked={basket.delivery?.id === opt.id}
                        onChange={() => handleSetDelivery(opt.id)}
                        disabled={busy}
                        className="h-4 w-4 accent-[#106655]" />
                      <span className="flex-1">{opt.name}</span>
                      <span className="font-medium text-amber-700">{opt.points === 0 ? 'Free' : `+${opt.points} pts`}</span>
                    </label>
                  ))}
                </section>
              )}

              {/* Discount code */}
              {basket.discount ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <div>
                    <p className="font-semibold text-emerald-900">{basket.discount.code} applied</p>
                    {basket.discount.description && <p className="text-xs text-emerald-700">{basket.discount.description}</p>}
                  </div>
                  <button onClick={handleRemovePromo} disabled={busy} className="text-xs font-medium text-emerald-800 hover:text-red-600">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="Discount code"
                    className="block min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none" />
                  <button onClick={handleApply} disabled={busy || !code.trim()}
                    className="shrink-0 rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    Apply
                  </button>
                </div>
              )}

              {/* Note */}
              <div className="rounded-xl border border-neutral-200 bg-white p-3">
                <label className="mb-1 block text-sm font-semibold">Note (optional)</label>
                <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={handleNotesBlur}
                  placeholder="Just remember to keep it clean. No room for filth here"
                  rows={2}
                  className="block w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
              </div>

            </div>

            {/* ── Sticky footer: totals + place order ── */}
            <div className="shrink-0 border-t border-neutral-200 bg-white px-4 py-4 space-y-3">

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <span>{basket.subtotal_points} pts</span>
                </div>
                {basket.discount_points > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span>−{basket.discount_points} pts</span>
                  </div>
                )}
                {basket.delivery && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Delivery</span>
                    <span>{basket.delivery_points === 0 ? 'Free' : `+${basket.delivery_points} pts`}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-neutral-100 pt-1.5 font-semibold">
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

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <button
                disabled={!canAfford || placing}
                onClick={handlePlace}
                className="w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-amber-900 shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                {placing ? 'Placing order...' : canAfford ? 'Place order' : "Not enough points. Keep earning!"}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
