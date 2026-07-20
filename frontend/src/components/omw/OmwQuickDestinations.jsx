import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import { syncOmwShortcuts } from '../../lib/omwActivity.js';
import CambridgeLocationPicker from './CambridgeLocationPicker.jsx';

/*
 * "On My Way" — quick destinations editor (up to 3 per user).
 *
 * Self-service, so it works for accounts without admin. Each slot holds a
 * Cambridge destination; a single "current transport" (bicycle | scooter)
 * applies to every triggered journey. Rendered on the Account page.
 */
export default function OmwQuickDestinations() {
  const { user } = useAuth();
  const isAdmin = user?.actual_role === 'admin' || user?.role === 'admin';
  // Katie only ever takes an Uber; David rides bike/scooter (taxi later).
  const transportOptions = user?.username === 'katie' ? ['uber'] : ['bicycle', 'scooter'];
  const [dests, setDests] = useState(null);
  const [transport, setTransport] = useState(null); // current transport
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedPos, setSavedPos] = useState(null);
  const [liveToPartner, setLiveToPartner] = useState(null); // admin-only two-way flag

  async function load() {
    try { setDests((await api.omw.listQuickDestinations()).destinations); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { api.omw.getTransport().then((r) => setTransport(r.transport)).catch(() => {}); }, []);

  async function chooseTransport(t) {
    setTransport(t);
    try { const r = await api.omw.setTransport(t); setTransport(r.transport); }
    catch (e) { setError(e.message); }
  }

  // The two-way toggle is admin-only (David for now).
  useEffect(() => {
    if (!isAdmin) return;
    api.omw.getConfig().then((c) => setLiveToPartner(!!c.live_to_partner)).catch(() => {});
  }, [isAdmin]);

  async function toggleLive() {
    const next = !liveToPartner;
    setLiveToPartner(next);
    try { const c = await api.omw.setConfig(next); setLiveToPartner(!!c.live_to_partner); }
    catch (e) { setError(e.message); setLiveToPartner(!next); }
  }

  function bySlot(pos) { return (dests || []).find((d) => d.position === pos) || null; }

  async function save(position, patch) {
    const current = bySlot(position) || {};
    const body = {
      label: patch.label ?? current.label,
      lat: patch.lat ?? current.lat,
      lng: patch.lng ?? current.lng,
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
      syncOmwShortcuts();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function remove(position) {
    setBusy(true); setError(null);
    try {
      await api.omw.deleteQuickDestination(position);
      setDests((prev) => (prev || []).filter((d) => d.position !== position));
      syncOmwShortcuts();
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

      {/* Current transport — applies to every triggered journey. */}
      <div className="rounded-xl border border-neutral-200 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Current transport</p>
        <p className="text-[11px] text-neutral-500">What you’re riding today — used by every journey you trigger.</p>
        <div className="mt-2 flex items-center gap-2">
          {transportOptions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => chooseTransport(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${(transport || transportOptions[0]) === t ? 'bg-sky-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && liveToPartner !== null && (
        <div className={`flex items-center justify-between rounded-xl border p-3 ${liveToPartner ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200'}`}>
          <div className="pr-3">
            <p className="text-sm font-medium">Go two-way</p>
            <p className="text-[11px] text-neutral-500">
              {liveToPartner
                ? 'Live: your trips push to your partner’s device (and theirs to you).'
                : 'Testing: trips loop back to your own device only.'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleLive}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${liveToPartner ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
          >
            {liveToPartner ? 'On' : 'Off'}
          </button>
        </div>
      )}

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

            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1">
                <CambridgeLocationPicker onPick={(loc) => save(pos, loc)} />
              </div>
              {d && (
                <button
                  type="button"
                  onClick={() => remove(pos)}
                  disabled={busy}
                  className="shrink-0 text-xs text-neutral-400 hover:text-red-600"
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
