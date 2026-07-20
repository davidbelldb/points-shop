import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import CambridgeLocationPicker from './CambridgeLocationPicker.jsx';

/*
 * "On My Way" — quick destinations editor (up to 3 per user).
 *
 * Self-service, so it works for accounts without admin. Each slot holds a
 * Cambridge destination + transport (bicycle | scooter). Slot 1 is the default
 * the quick action fires. Rendered on the Account page.
 */
export default function OmwQuickDestinations() {
  const [dests, setDests] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedPos, setSavedPos] = useState(null);

  async function load() {
    try { setDests((await api.omw.listQuickDestinations()).destinations); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  function bySlot(pos) { return (dests || []).find((d) => d.position === pos) || null; }

  async function save(position, patch) {
    const current = bySlot(position) || {};
    const body = {
      label: patch.label ?? current.label,
      lat: patch.lat ?? current.lat,
      lng: patch.lng ?? current.lng,
      transport: patch.transport ?? current.transport ?? 'bicycle',
    };
    if (!body.label || body.lat == null) { setError('Pick a place first.'); return; }
    setBusy(true); setError(null);
    try {
      const updated = await api.omw.setQuickDestination(position, body);
      setDests((prev) => {
        const others = (prev || []).filter((d) => d.position !== position);
        return [...others, updated].sort((a, b) => a.position - b.position);
      });
      setSavedPos(position); setTimeout(() => setSavedPos(null), 1400);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function remove(position) {
    setBusy(true); setError(null);
    try {
      await api.omw.deleteQuickDestination(position);
      setDests((prev) => (prev || []).filter((d) => d.position !== position));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!dests) {
    return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-neutral-500">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">On My Way destinations</h2>
        <p className="text-xs text-neutral-500">
          Up to three quick destinations. Slot 1 is the default your “On My Way” quick action fires. Search is
          limited to Cambridge.
        </p>
      </div>

      {[1, 2, 3].map((pos) => {
        const d = bySlot(pos);
        return (
          <div key={pos} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Slot {pos}{pos === 1 ? ' · default' : ''}
              </p>
              {savedPos === pos && <span className="text-xs text-emerald-600">Saved ✓</span>}
            </div>

            <p className="mt-1 text-sm">
              {d
                ? <><span className="font-medium">{d.label}</span>
                    <span className="ml-1 text-[10px] text-neutral-400">({Number(d.lat).toFixed(4)}, {Number(d.lng).toFixed(4)})</span></>
                : <span className="text-neutral-400">empty</span>}
            </p>

            <div className="mt-2">
              <CambridgeLocationPicker onPick={(loc) => save(pos, loc)} />
            </div>

            <div className="mt-2 flex items-center gap-2">
              {['bicycle', 'scooter'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => save(pos, { transport: t })}
                  disabled={busy || !d}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize disabled:opacity-40 ${(d?.transport || 'bicycle') === t ? 'bg-sky-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
                >
                  {t}
                </button>
              ))}
              {d && (
                <button
                  type="button"
                  onClick={() => remove(pos)}
                  disabled={busy}
                  className="ml-auto text-xs text-neutral-400 hover:text-red-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        );
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
