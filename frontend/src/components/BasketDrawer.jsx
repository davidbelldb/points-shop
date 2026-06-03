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
        <div className="flex shrink-0 items-center justify-between border-b border-white/20 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <img src="/sphincter-pink.svg" alt="" className="h-5 w-5" />
            {isEmpty ? "Katie's safe pocket" : `Katie's safe pocket (${basket.items.length})`}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close safe pocket"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white transition-colors"
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
            <p className="text-sm text-white/70">Loading...</p>
          </div>
        )}

        {/* ── Empty state ── */}
        {basket && isEmpty && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex items-center justify-center">
              <img src="/sphincter-pink.svg" alt="" className="h-16 w-16" />
            </div>
            <div>
              <p className="font-semibold text-white">It's a bit clean in here</p>
              <p className="mt-1 text-sm text-white">Probably the perfect time to put something in it...</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-amber-900"
            >
              Close
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
                  <li key={item.id} className="flex gap-3 rounded-xl border border-white/20 bg-white/10 p-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/20 text-white">
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
                          <h3 className="text-sm font-medium leading-tight text-white">{item.name}</h3>
                          <button onClick={() => removeItem(item.product_id)} className="text-xs text-white/60 hover:text-red-400">Remove</button>
                        </div>
                        <p className="text-sm font-semibold text-white/80">{item.price_points} pts</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setItemQty(item.product_id, item.qty - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 text-base text-white"
                          aria-label="Decrease">−</button>
                        <span className="min-w-6 text-center text-sm font-medium text-white">{item.qty}</span>
                        <button onClick={() => setItemQty(item.product_id, item.qty + 1)}
                          disabled={item.qty >= item.stock_qty}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 text-base text-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Increase">+</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Delivery */}
              {deliveryOptions.length > 0 && (
                <section className="space-y-1 rounded-xl border border-white/20 bg-white/10 p-3">
                  <p className="text-sm font-semibold text-white">Delivery</p>
                  {deliveryOptions.map((opt) => (
                    <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm text-white hover:bg-white/10">
                      <input type="radio" name="drawer-delivery"
                        checked={basket.delivery?.id === opt.id}
                        onChange={() => handleSetDelivery(opt.id)}
                        disabled={busy}
                        className="h-4 w-4 accent-[#106655]" />
                      <span className="flex-1">{opt.name}</span>
                      <span className="font-medium text-white/80">{opt.points === 0 ? 'Free' : `+${opt.points} pts`}</span>
                    </label>
                  ))}
                </section>
              )}

              {/* Discount code */}
              {basket.discount ? (
                <div className="flex items-center justify-between rounded-xl border border-white/20 bg-white/10 p-3 text-sm">
                  <div>
                    <p className="font-semibold text-white">{basket.discount.code} applied</p>
                    {basket.discount.description && <p className="text-xs text-white/70">{basket.discount.description}</p>}
                  </div>
                  <button onClick={handleRemovePromo} disabled={busy} className="text-xs font-medium text-white/70 hover:text-red-400">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="Discount code"
                    className="block min-w-0 flex-1 rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 focus:border-white/60 focus:outline-none" />
                  <button onClick={handleApply} disabled={busy || !code.trim()}
                    className="shrink-0 rounded-md bg-white/20 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    Apply
                  </button>
                </div>
              )}

              {/* Note */}
              <div className="rounded-xl border border-white/20 bg-white/10 p-3">
                <label className="mb-1 block text-sm font-semibold text-white">Note (optional)</label>
                <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={handleNotesBlur}
                  placeholder="Just remember to keep it clean. No room for filth here"
                  rows={2}
                  className="block w-full resize-none rounded-md border border-white/30 bg-white/10 px-2 py-1.5 text-sm text-white placeholder-white/50 focus:border-white/60 focus:outline-none" />
              </div>

            </div>

            {/* ── Sticky footer: totals + place order ── */}
            <div className="shrink-0 border-t border-white/20 bg-white/10 px-4 py-4 space-y-3">

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/70">Subtotal</span>
                  <span className="text-white">{basket.subtotal_points} pts</span>
                </div>
                {basket.discount_points > 0 && (
                  <div className="flex justify-between text-white/80">
                    <span>Discount</span>
                    <span>−{basket.discount_points} pts</span>
                  </div>
                )}
                {basket.delivery && (
                  <div className="flex justify-between">
                    <span className="text-white/70">Delivery</span>
                    <span className="text-white">{basket.delivery_points === 0 ? 'Free' : `+${basket.delivery_points} pts`}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/20 pt-1.5 font-semibold text-white">
                  <span>Total</span>
                  <span>{basket.total_points} pts</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Your balance</span>
                  <span className={canAfford ? 'font-medium text-white' : 'font-medium text-red-400'}>
                    {balance.toLocaleString()} pts
                  </span>
                </div>
              </div>

              {error && <p className="rounded-lg bg-white/10 px-3 py-2 text-sm text-red-400">{error}</p>}

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
