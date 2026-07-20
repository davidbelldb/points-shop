import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { syncOmwShortcuts } from '../lib/omwActivity.js';
import CambridgeLocationPicker from '../components/omw/CambridgeLocationPicker.jsx';

/*
 * Admin "On My Way" — David configures every user's destinations + transport in
 * one place. Each person only ever sees their OWN destinations on their phone's
 * long-press / Siri (the device syncs the logged-in user's list), so setting
 * Katie's here just makes them show up on her phone, never on David's.
 */

function transportOptionsFor(username) {
  return username === 'katie' ? ['uber'] : ['bicycle', 'scooter'];
}

function UserOmwEditor({ account }) {
  const [dests, setDests] = useState(null);
  const [transport, setTransport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedPos, setSavedPos] = useState(null);
  const options = transportOptionsFor(account.username);

  useEffect(() => {
    api.omw.adminListDestinations(account.id).then((r) => setDests(r.destinations)).catch((e) => setError(e.message));
    api.omw.adminGetTransport(account.id).then((r) => setTransport(r.transport)).catch(() => {});
  }, [account.id]);

  function bySlot(pos) { return (dests || []).find((d) => d.position === pos) || null; }

  async function save(pos, patch) {
    const cur = bySlot(pos) || {};
    const body = { label: patch.label ?? cur.label, lat: patch.lat ?? cur.lat, lng: patch.lng ?? cur.lng };
    if (!body.label || body.lat == null) { setError('Pick a place first.'); return; }
    setBusy(true); setError(null);
    try {
      const updated = await api.omw.adminSetDestination(account.id, pos, body);
      setDests((prev) => [...(prev || []).filter((d) => d.position !== pos), updated].sort((a, b) => a.position - b.position));
      setSavedPos(pos); setTimeout(() => setSavedPos(null), 1400);
      syncOmwShortcuts(); // refresh this device's own menu if it's David's list
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function remove(pos) {
    setBusy(true); setError(null);
    try {
      await api.omw.adminDeleteDestination(account.id, pos);
      setDests((prev) => (prev || []).filter((d) => d.position !== pos));
      syncOmwShortcuts();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function chooseTransport(t) {
    setTransport(t);
    try { const r = await api.omw.adminSetTransport(account.id, t); setTransport(r.transport); }
    catch (e) { setError(e.message); }
  }

  if (!dests) {
    return error
      ? <p className="text-xs text-red-600">{error} — is the backend deployed with the OMW admin endpoints?</p>
      : <p className="text-xs text-neutral-500">Loading…</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Transport</span>
        {options.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => chooseTransport(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${(transport || options[0]) === t ? 'bg-sky-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {[1, 2, 3].map((pos) => {
        const d = bySlot(pos);
        return (
          <div key={pos} className="rounded-lg border border-neutral-200 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Slot {pos}{pos === 1 ? ' · default' : ''}
              </span>
              {savedPos === pos && <span className="text-xs text-emerald-600">Saved ✓</span>}
            </div>
            <p className="text-sm">
              {d
                ? <><span className="font-medium">{d.label}</span>
                    <span className="ml-1 text-[10px] text-neutral-400">({Number(d.lat).toFixed(4)}, {Number(d.lng).toFixed(4)})</span></>
                : <span className="text-neutral-400">empty</span>}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1"><CambridgeLocationPicker onPick={(loc) => save(pos, loc)} /></div>
              {d && (
                <button type="button" onClick={() => remove(pos)} disabled={busy}
                  className="shrink-0 text-xs text-neutral-400 hover:text-red-600">Clear</button>
              )}
            </div>
          </div>
        );
      })}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function AdminOmwSection() {
  const [users, setUsers] = useState(null);
  const [liveToPartner, setLiveToPartner] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.admin.listUsers().then(setUsers).catch((e) => setError(e.message));
    api.omw.getConfig().then((c) => setLiveToPartner(!!c.live_to_partner)).catch(() => {});
  }, []);

  async function toggleLive() {
    const next = !liveToPartner;
    setLiveToPartner(next);
    try { const c = await api.omw.setConfig(next); setLiveToPartner(!!c.live_to_partner); }
    catch (e) { setError(e.message); setLiveToPartner(!next); }
  }

  if (!users) {
    return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-neutral-500">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Set each person’s destinations + transport. Everyone only sees their own on their phone’s long-press and Siri.
        Slot 1 is the default the quick action fires. Search is limited to Cambridge.
      </p>

      {liveToPartner !== null && (
        <div className={`flex items-center justify-between rounded-xl border p-3 ${liveToPartner ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200'}`}>
          <div className="pr-3">
            <p className="text-sm font-medium">Go two-way</p>
            <p className="text-[11px] text-neutral-500">
              {liveToPartner
                ? 'Live: trips push to the other person’s device.'
                : 'Testing: trips loop back to the traveller’s own device only.'}
            </p>
          </div>
          <button type="button" onClick={toggleLive}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${liveToPartner ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
            {liveToPartner ? 'On' : 'Off'}
          </button>
        </div>
      )}

      {users.map((u) => (
        <div key={u.id} className="rounded-xl border border-neutral-200 p-3">
          <p className="text-sm font-medium">
            {u.name || u.username}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-400">{u.role}</span>
          </p>
          <div className="mt-2"><UserOmwEditor account={u} /></div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
