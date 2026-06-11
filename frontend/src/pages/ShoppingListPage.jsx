/**
 * Shopping list — shared between both accounts, Waitrose products only
 * (FatSecret search proxied via the backend).
 *
 * Layout: trips are dated, collapsible sections stacked down the page in
 * date order. The trip nearest today opens automatically; headers read
 * TODAY / TOMORROW / "FRI 13 JUN". The search field adds to whichever
 * section is open. Ticked items sink into an "IN HAND" subsection.
 * Undated leftovers live in a GENERAL section at the bottom.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

// ── Date helpers ──────────────────────────────────────────────────────────────
const dayStr = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local tz

// Belt-and-braces: trip_date should arrive as YYYY-MM-DD, but never trust a
// date that may have travelled as an ISO timestamp.
const normTrip = (t) => ({ ...t, trip_date: t.trip_date ? String(t.trip_date).slice(0, 10) : null });

function tripLabel(dateStr) {
  if (!dateStr) return 'GENERAL';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (dateStr === dayStr(today)) return 'TODAY';
  if (dateStr === dayStr(tomorrow)) return 'TOMORROW';
  return new Date(`${dateStr}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase(); // e.g. "FRI 13 JUN"
}

/** Pick which section opens by default: nearest upcoming trip, else the most
    recent past one, else General. */
function nearestKey(trips) {
  if (!trips.length) return 'general';
  const today = dayStr(new Date());
  const dated = trips.filter((t) => t.trip_date);
  if (!dated.length) return 'general';
  const upcoming = dated.filter((t) => t.trip_date >= today).sort((a, b) => a.trip_date.localeCompare(b.trip_date));
  if (upcoming.length) return upcoming[0].id;
  const past = dated.sort((a, b) => b.trip_date.localeCompare(a.trip_date));
  return past[0].id;
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShoppingListPage() {
  const [items, setItems]   = useState(null);
  const [trips, setTrips]   = useState(null);
  const [openKey, setOpenKey] = useState(null);  // trip id | 'general'
  const [error, setError]   = useState(null);
  const [q, setQ]           = useState('');
  const [usuals, setUsuals] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addTripOpen, setAddTripOpen] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripDate, setNewTripDate] = useState(() => dayStr(new Date()));
  const [toast, setToast]   = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    Promise.all([api.shopItems(), api.shopTrips()])
      .then(([{ items: it }, { trips: tr }]) => {
        const norm = tr.map(normTrip);
        setItems(it);
        setTrips(norm);
        setOpenKey(nearestKey(norm));
      })
      .catch((e) => setError(e.message));
    return () => clearTimeout(toastTimer.current);
  }, []);

  // Upcoming calendar events — offered as trip name/date when adding a trip
  const [upcoming, setUpcoming] = useState([]);
  useEffect(() => {
    if (!addTripOpen || upcoming.length) return;
    api.listCalendarUpcoming(10)
      .then((res) => setUpcoming(Array.isArray(res) ? res : (res?.events ?? [])))
      .catch(() => {});
  }, [addTripOpen, upcoming.length]);

  // ── Search — usuals + Waitrose products (FatSecret) ───────────────────────
  useEffect(() => {
    const term = q.trim();
    if (!term) { setUsuals([]); setProducts([]); setSearchError(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const [{ suggestions }, res] = await Promise.all([
          api.shopSuggest(term),
          term.length >= 3 ? api.shopOffSearch(term) : Promise.resolve({ products: [] }),
        ]);
        setUsuals(suggestions);
        setProducts(res.products);
        setSearchError(res.error ?? null);
      } catch { /* soft fail */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // ── Item actions ───────────────────────────────────────────────────────────
  const addItem = useCallback(async ({ name, image_url = null, barcode = null }) => {
    if (!name?.trim()) return;
    setQ('');
    setUsuals([]);
    setProducts([]);
    const tripId = openKey === 'general' || openKey === null ? null : openKey;
    try {
      const item = await api.shopAddItem({ name: name.trim(), image_url, barcode, trip_id: tripId });
      setItems((prev) => [item, ...(prev ?? [])]);
      showToast(`Added ${item.name}`);
    } catch (e) { setError(e.message); }
  }, [openKey]);

  function toggleItem(item) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !item.checked } : i)));
    api.shopUpdateItem(item.id, { checked: !item.checked }).catch(() => {});
  }

  function bumpQty(item, delta) {
    const qty = Math.max(1, Math.min(99, item.qty + delta));
    if (qty === item.qty) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, qty } : i)));
    api.shopUpdateItem(item.id, { qty }).catch(() => {});
  }

  function removeItem(item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    api.shopDeleteItem(item.id).catch(() => {});
  }

  function clearChecked(tripId) {
    setItems((prev) => prev.filter((i) => !(i.checked && (i.trip_id ?? null) === tripId)));
    api.shopClearChecked(tripId).catch(() => {});
  }

  // ── Trip actions ───────────────────────────────────────────────────────────
  async function addTrip() {
    if (!newTripDate) return;
    try {
      const trip = normTrip(await api.shopAddTrip(newTripName.trim() || 'Shop', newTripDate));
      setTrips((prev) => [...(prev ?? []), trip]);
      setOpenKey(trip.id);
      setAddTripOpen(false);
      setNewTripName('');
      setNewTripDate(dayStr(new Date()));
    } catch (e) { setError(e.message); }
  }

  function redateTrip(trip, tripDate) {
    if (!tripDate) return;
    setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, trip_date: tripDate } : t)));
    api.shopUpdateTrip(trip.id, { trip_date: tripDate }).catch((e) => setError(e.message));
  }

  async function deleteTrip(trip) {
    if (!confirm(`Delete this trip? Its items move to General.`)) return;
    try {
      await api.shopDeleteTrip(trip.id);
      setTrips((prev) => prev.filter((t) => t.id !== trip.id));
      setItems((prev) => prev?.map((i) => (i.trip_id === trip.id ? { ...i, trip_id: null } : i)) ?? prev);
      if (openKey === trip.id) setOpenKey('general');
    } catch (e) { setError(e.message); }
  }

  // ── Section building ───────────────────────────────────────────────────────
  const tripItems = (tripId) => (items ?? []).filter((i) => (i.trip_id ?? null) === tripId);
  const sortedTrips = [...(trips ?? [])].sort((a, b) =>
    (a.trip_date ?? '9999').localeCompare(b.trip_date ?? '9999'));
  const generalItems = tripItems(null);
  const sections = [
    ...sortedTrips.map((t) => ({ key: t.id, trip: t, label: tripLabel(t.trip_date), list: tripItems(t.id) })),
    // General only shows if it has anything in it (or nothing else exists)
    ...((generalItems.length > 0 || sortedTrips.length === 0)
      ? [{ key: 'general', trip: null, label: 'GENERAL', list: generalItems }]
      : []),
  ];

  const hasSuggestions = q.trim() && (usuals.length > 0 || products.length > 0 || searching || searchError);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Sneaky Shopping List</h1>
          <p className="text-sm text-neutral-500">Adds to the open trip below.</p>
        </div>
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* ── Lookup field ── */}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem({ name: q }); }}
          placeholder="Add something sneaky…"
          autoCapitalize="off"
          autoCorrect="off"
          className="h-14 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-base text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400"
        />

        {hasSuggestions && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
            {searchError && (
              <p className="px-4 py-2 text-xs font-semibold text-red-700">{searchError}</p>
            )}
            {usuals.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">The usuals</p>
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
            {products.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400">Products · powered by fatsecret</p>
                {products.map((p, i) => (
                  <button
                    key={`p-${i}`}
                    onClick={() => addItem({ name: p.name, image_url: p.image_url, barcode: p.barcode })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-100"
                  >
                    <Thumb item={p} />
                    <span className="truncate text-sm font-medium text-neutral-900">{p.name}</span>
                  </button>
                ))}
              </>
            )}
            {searching && <p className="px-4 py-3 text-xs text-neutral-400">Searching…</p>}
            <button
              onClick={() => addItem({ name: q })}
              className="flex w-full items-center gap-2 border-t border-neutral-200 px-4 py-3 text-left text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              + Add “{q.trim()}”
            </button>
          </div>
        )}
      </div>

      {/* ── New trip ── */}
      {addTripOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
          <input
            type="date"
            value={newTripDate}
            onChange={(e) => setNewTripDate(e.target.value)}
            className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none"
          />
          <input
            value={newTripName}
            onChange={(e) => setNewTripName(e.target.value)}
            placeholder="Trip name (optional)"
            className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none"
          />
          <button onClick={addTrip} className="h-10 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-amber-950">Add</button>
          <button onClick={() => setAddTripOpen(false)} className="h-10 px-2 text-sm text-neutral-500">Cancel</button>
          {upcoming.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                const ev = upcoming[Number(e.target.value)];
                if (!ev) return;
                setNewTripName(ev.title);
                setNewTripDate(dayStr(new Date(ev.starts_at)));
              }}
              className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm text-neutral-600 outline-none"
            >
              <option value="" disabled>…or pick a calendar event</option>
              {upcoming.map((ev, i) => (
                <option key={ev.id} value={i}>
                  {new Date(ev.starts_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} — {ev.title}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <button
          onClick={() => setAddTripOpen(true)}
          className="w-full rounded-2xl border-2 border-dashed border-neutral-200 py-2.5 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
        >
          + New trip
        </button>
      )}

      {/* ── Trip sections — collapsible, in date order ── */}
      {items === null || trips === null ? (
        <p className="py-8 text-center text-sm text-neutral-500">Loading the list…</p>
      ) : (
        sections.map(({ key, trip, label, list }) => {
          const open = openKey === key;
          const unchecked = list.filter((i) => !i.checked);
          const checked   = list.filter((i) => i.checked);
          return (
            <div key={key} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              {/* Header */}
              <button
                onClick={() => setOpenKey(open ? null : key)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 text-neutral-400 transition-transform"
                  style={{ transform: open ? 'rotate(90deg)' : 'none' }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="text-sm font-bold tracking-wide text-neutral-900">{label}</span>
                {trip?.name && trip.name !== 'Shop' && (
                  <span className="truncate text-sm text-neutral-500">{trip.name}</span>
                )}
                <span className="ml-auto text-xs font-semibold text-neutral-400">
                  {unchecked.length > 0 ? `${unchecked.length} to get` : checked.length > 0 ? 'all in hand' : 'empty'}
                </span>
              </button>

              {/* Body */}
              {open && (
                <div className="space-y-1.5 px-3 pb-3">
                  {trip && (
                    <div className="flex items-center justify-between px-1 pb-1">
                      <input
                        type="date"
                        value={trip.trip_date ?? ''}
                        onChange={(e) => redateTrip(trip, e.target.value)}
                        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs text-neutral-600 outline-none"
                      />
                      <button onClick={() => deleteTrip(trip)} className="text-xs font-semibold text-neutral-400 hover:text-red-700">
                        Delete trip
                      </button>
                    </div>
                  )}

                  {unchecked.length === 0 && checked.length === 0 && (
                    <p className="px-1 py-2 text-sm text-neutral-400">List's empty. Such a little porker.</p>
                  )}

                  {unchecked.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl bg-neutral-100 px-3 py-2.5">
                      <button onClick={() => toggleItem(item)} aria-label="Tick off">
                        <CheckCircle checked={false} />
                      </button>
                      <Thumb item={item} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{item.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button onClick={() => bumpQty(item, -1)} className="h-8 w-8 rounded-lg bg-white text-base font-bold text-neutral-600">−</button>
                        <span className="w-7 text-center text-sm font-bold text-neutral-900">{item.qty}</span>
                        <button onClick={() => bumpQty(item, 1)} className="h-8 w-8 rounded-lg bg-white text-base font-bold text-neutral-600">+</button>
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
                      <div className="flex items-center justify-between px-1 pt-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">In Hand ({checked.length})</p>
                        <button
                          onClick={() => clearChecked(trip?.id ?? null)}
                          className="text-xs font-semibold text-neutral-500 underline-offset-2 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                      {checked.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl bg-neutral-100 px-3 py-2.5 opacity-55">
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
            </div>
          );
        })
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-6">
          <p className="rounded-xl bg-[#171717]/95 px-4 py-2 text-sm font-semibold text-white shadow-xl">{toast}</p>
        </div>
      )}
    </div>
  );
}
