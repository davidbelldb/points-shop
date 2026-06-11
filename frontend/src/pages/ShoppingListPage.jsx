/**
 * Shopping list — shared between both accounts, powered by Open Food Facts.
 *
 * - Big lookup field: suggestions come from "your usuals" (purchase history)
 *   plus Open Food Facts text search (proxied via the backend). Enter adds
 *   whatever's typed as a free-text item.
 * - Barcode button inside the field opens a camera scanner: native
 *   BarcodeDetector where available (Android/Chrome), @zxing/browser
 *   fallback elsewhere (iOS Safari — dynamically imported only when used).
 * - Items: tick off, adjust qty, delete; ticked items sink to a "got it"
 *   section with a clear-all sweep.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

function BarcodeIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M3 5v14M7 5v14M11 5v9M14 5v14M18 5v9M21 5v14" />
    </svg>
  );
}

function CheckCircle({ checked }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
        checked ? 'border-amber-400 bg-amber-400 text-amber-950' : 'border-neutral-300 bg-transparent'
      }`}
    >
      {checked && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  );
}

function Thumb({ item }) {
  if (item.image_url) {
    return <img src={item.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain" />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-base">
      🛒
    </span>
  );
}

// ─── Barcode scanner overlay ──────────────────────────────────────────────────
function ScannerOverlay({ onHit, onClose }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('Starting camera…');

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let zxingControls = null;

    const stop = () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
      zxingControls?.stop();
    };

    (async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        if ('BarcodeDetector' in window) {
          // Native path — Android/Chrome
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
          });
          if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.srcObject = stream;
          await video.play().catch(() => {});
          setStatus('Point at a barcode');
          const detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes.length && codes[0].rawValue) {
                stop();
                onHit(codes[0].rawValue);
                return;
              }
            } catch { /* frame not ready */ }
            requestAnimationFrame(tick);
          };
          tick();
        } else {
          // iOS Safari etc. — ZXing fallback, loaded on demand
          setStatus('Loading scanner…');
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (stopped) return;
          const reader = new BrowserMultiFormatReader();
          setStatus('Point at a barcode');
          zxingControls = await reader.decodeFromVideoDevice(undefined, video, (result, _err, controls) => {
            if (stopped) { controls.stop(); return; }
            if (result?.getText()) {
              controls.stop();
              stopped = true;
              onHit(result.getText());
            }
          });
        }
      } catch (err) {
        setStatus(err?.name === 'NotAllowedError' ? 'Camera access blocked' : 'Camera unavailable');
      }
    })();

    return stop;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      {/* Reticle */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-36 w-72 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-6"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <p className="text-sm font-semibold text-white/90">{status}</p>
        <button
          onClick={onClose}
          className="rounded-2xl bg-[#3B1D1D] px-8 py-3 text-base font-bold text-[#F2B8B5] active:scale-95"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShoppingListPage() {
  const [items, setItems]     = useState(null);
  const [trips, setTrips]     = useState([]);
  const [activeTrip, setActiveTrip] = useState(null); // null = General
  const [error, setError]     = useState(null);
  const [q, setQ]             = useState('');
  const [usuals, setUsuals]   = useState([]);
  const [offResults, setOffResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [scanning, setScanning]     = useState(false);
  const [toast, setToast]     = useState(null);
  const inputRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    api.shopItems().then(({ items: loaded }) => setItems(loaded)).catch((e) => setError(e.message));
    api.shopTrips().then(({ trips: loaded }) => setTrips(loaded)).catch(() => {});
    return () => clearTimeout(toastTimer.current);
  }, []);

  // ── Trips ──────────────────────────────────────────────────────────────────
  async function addTrip() {
    const name = window.prompt('Trip name', '');
    if (!name?.trim()) return;
    try {
      const trip = await api.shopAddTrip(name.trim());
      setTrips((prev) => [...prev, trip]);
      setActiveTrip(trip.id);
    } catch (e) { setError(e.message); }
  }

  function renameTrip(trip) {
    const name = window.prompt('Trip name', trip.name);
    if (!name?.trim()) return;
    setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, name: name.trim() } : t)));
    api.shopRenameTrip(trip.id, name.trim()).catch((e) => setError(e.message));
  }

  async function deleteTrip(trip) {
    if (!confirm(`Delete trip "${trip.name}"? Its items move to General.`)) return;
    try {
      await api.shopDeleteTrip(trip.id);
      setTrips((prev) => prev.filter((t) => t.id !== trip.id));
      setItems((prev) => prev?.map((i) => (i.trip_id === trip.id ? { ...i, trip_id: null } : i)) ?? prev);
      if (activeTrip === trip.id) setActiveTrip(null);
    } catch (e) { setError(e.message); }
  }

  const tripTapRef = useRef({ t: 0, id: null });
  function onTripTap(id) {
    const now = Date.now();
    const last = tripTapRef.current;
    tripTapRef.current = { t: now, id };
    if (id !== null && id === activeTrip && last.id === id && now - last.t < 400) {
      renameTrip(trips.find((t) => t.id === id));
      return;
    }
    setActiveTrip(id);
  }

  // ── Lookup — debounced usuals + OFF search ─────────────────────────────────
  useEffect(() => {
    const term = q.trim();
    if (!term) { setUsuals([]); setOffResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const [{ suggestions }, off] = await Promise.all([
          api.shopSuggest(term),
          term.length >= 3 ? api.shopOffSearch(term) : Promise.resolve({ products: [] }),
        ]);
        setUsuals(suggestions);
        setOffResults(off.products);
      } catch { /* soft fail */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const addItem = useCallback(async ({ name, image_url = null, barcode = null }) => {
    if (!name?.trim()) return;
    setQ('');
    setUsuals([]);
    setOffResults([]);
    try {
      const item = await api.shopAddItem({ name: name.trim(), image_url, barcode, trip_id: activeTrip });
      setItems((prev) => [item, ...(prev ?? [])]);
      showToast(`Added ${item.name}`);
    } catch (e) { setError(e.message); }
  }, [activeTrip]);

  async function toggleItem(item) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !item.checked } : i)));
    api.shopUpdateItem(item.id, { checked: !item.checked }).catch(() => {});
  }

  async function bumpQty(item, delta) {
    const qty = Math.max(1, Math.min(99, item.qty + delta));
    if (qty === item.qty) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, qty } : i)));
    api.shopUpdateItem(item.id, { qty }).catch(() => {});
  }

  async function removeItem(item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    api.shopDeleteItem(item.id).catch(() => {});
  }

  async function clearChecked() {
    setItems((prev) => prev.filter((i) => !(i.checked && (i.trip_id ?? null) === activeTrip)));
    api.shopClearChecked(activeTrip).catch(() => {});
  }

  // Barcode hit → look it up on OFF, add with whatever we learn
  async function onBarcode(code) {
    setScanning(false);
    showToast('Looking up barcode…');
    try {
      const res = await api.shopOffProduct(code);
      if (res.found && res.product.name) {
        const label = res.product.brand && !res.product.name.toLowerCase().includes(res.product.brand.toLowerCase())
          ? `${res.product.name} (${res.product.brand})`
          : res.product.name;
        addItem({ name: label, image_url: res.product.image_url, barcode: code });
      } else {
        showToast('Not in Open Food Facts — add it by name');
        inputRef.current?.focus();
      }
    } catch {
      showToast('Lookup failed — add it by name');
    }
  }

  const hasSuggestions = q.trim() && (usuals.length > 0 || offResults.length > 0 || searching);
  const tripItems = (items ?? []).filter((i) => (i.trip_id ?? null) === activeTrip);
  const unchecked = tripItems.filter((i) => !i.checked);
  const checked   = tripItems.filter((i) => i.checked);
  const tripCount = (id) => (items ?? []).filter((i) => (i.trip_id ?? null) === id && !i.checked).length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Shopping List</h1>
          <p className="text-sm text-neutral-500">Type to search, or scan a barcode.</p>
        </div>
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* ── Trips — items are added to the active trip ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => onTripTap(null)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            activeTrip === null ? 'bg-amber-400 text-amber-950' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          General{tripCount(null) > 0 ? ` (${tripCount(null)})` : ''}
        </button>
        {trips.map((trip) => (
          <span key={trip.id} className="flex shrink-0 items-center">
            <button
              onClick={() => onTripTap(trip.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeTrip === trip.id ? 'bg-amber-400 text-amber-950' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {trip.name}{tripCount(trip.id) > 0 ? ` (${tripCount(trip.id)})` : ''}
            </button>
            {activeTrip === trip.id && (
              <button
                onClick={() => deleteTrip(trip)}
                title="Delete trip"
                className="ml-0.5 rounded px-1 text-neutral-400 hover:text-red-700"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          onClick={addTrip}
          title="New trip"
          className="shrink-0 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
        >
          +
        </button>
      </div>

      {/* ── Lookup field — generous height, barcode button inside (right) ── */}
      <div className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem({ name: q }); }}
          placeholder="Add something sneaky…"
          autoCapitalize="off"
          autoCorrect="off"
          className="h-14 w-full rounded-2xl border border-neutral-200 bg-white pl-4 pr-14 text-base text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400"
        />
        <button
          onClick={() => setScanning(true)}
          title="Scan a barcode"
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-amber-400 text-amber-950 transition hover:bg-amber-500 active:scale-95"
        >
          <BarcodeIcon className="h-5 w-5" />
        </button>

        {/* Suggestions dropdown */}
        {hasSuggestions && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
            {usuals.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">Your usuals</p>
                {usuals.map((s) => (
                  <button
                    key={`u-${s.name}`}
                    onClick={() => addItem({ name: s.name, image_url: s.image_url, barcode: s.barcode })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-100"
                  >
                    <Thumb item={s} />
                    <span className="truncate text-sm font-medium text-neutral-900">{s.name}</span>
                  </button>
                ))}
              </>
            )}
            {offResults.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">Open Food Facts</p>
                {offResults.map((p, i) => (
                  <button
                    key={`o-${p.barcode ?? i}`}
                    onClick={() => addItem({
                      name: p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.name} (${p.brand})` : p.name,
                      image_url: p.image_url,
                      barcode: p.barcode,
                    })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-100"
                  >
                    <Thumb item={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900">{p.name}</span>
                      {p.brand && <span className="block truncate text-xs text-neutral-500">{p.brand}</span>}
                    </span>
                  </button>
                ))}
              </>
            )}
            {searching && (
              <p className="px-4 py-3 text-xs text-neutral-400">Searching…</p>
            )}
            <button
              onClick={() => addItem({ name: q })}
              className="flex w-full items-center gap-2 border-t border-neutral-200 px-4 py-3 text-left text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              + Add “{q.trim()}”
            </button>
          </div>
        )}
      </div>

      {/* ── The list ── */}
      {items === null ? (
        <p className="py-8 text-center text-sm text-neutral-500">Loading the list…</p>
      ) : unchecked.length === 0 && checked.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">List's empty. Living the dream.</p>
      ) : (
        <div className="space-y-1.5">
          {unchecked.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm">
              <button onClick={() => toggleItem(item)} aria-label="Tick off">
                <CheckCircle checked={false} />
              </button>
              <Thumb item={item} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{item.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                <button onClick={() => bumpQty(item, -1)} className="h-8 w-8 rounded-lg bg-neutral-100 text-base font-bold text-neutral-600">−</button>
                <span className="w-7 text-center text-sm font-bold text-neutral-900">{item.qty}</span>
                <button onClick={() => bumpQty(item, 1)} className="h-8 w-8 rounded-lg bg-neutral-100 text-base font-bold text-neutral-600">+</button>
              </span>
              <button onClick={() => removeItem(item)} title="Remove" className="px-1 text-neutral-300 hover:text-red-700">
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
                </svg>
              </button>
            </div>
          ))}

          {checked.length > 0 && (
            <>
              <div className="flex items-center justify-between pt-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Got it ({checked.length})</p>
                <button onClick={clearChecked} className="text-xs font-semibold text-neutral-500 underline-offset-2 hover:underline">
                  Clear ticked
                </button>
              </div>
              {checked.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 opacity-55 shadow-sm">
                  <button onClick={() => toggleItem(item)} aria-label="Untick">
                    <CheckCircle checked />
                  </button>
                  <Thumb item={item} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 line-through">{item.name}</span>
                  {item.qty > 1 && <span className="text-xs font-bold text-neutral-500">×{item.qty}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-6">
          <p className="rounded-xl bg-[#171717]/95 px-4 py-2 text-sm font-semibold text-white shadow-xl">{toast}</p>
        </div>
      )}

      {scanning && <ScannerOverlay onHit={onBarcode} onClose={() => setScanning(false)} />}
    </div>
  );
}
