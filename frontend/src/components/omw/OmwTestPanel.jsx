import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { startOmwTrip, stopOmwTrip, activeOmwTripId } from '../../lib/omwActivity.js';

/*
 * "On My Way" — /new-chat test harness panel (David-only during v1).
 *
 * Pick one of your quick destinations + transport, then trigger. The trip loops
 * back to your own device, so you watch your own progress along the route.
 * Location pings come from the native background plugin + a foreground
 * watchPosition fallback (see lib/omwActivity.js).
 */
export default function OmwTestPanel({ dark, autoStart }) {
  const [dests, setDests] = useState([]);
  const [destId, setDestId] = useState('');
  const [transport, setTransport] = useState('bicycle'); // current transport (display)
  const [trip, setTrip] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | starting | tracking | error
  const [error, setError] = useState(null);

  const card = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200';

  useEffect(() => {
    api.omw.listQuickDestinations()
      .then((r) => {
        const list = r.destinations || [];
        setDests(list);
        if (list[0]) setDestId(list[0].id);
      })
      .catch((e) => setError(e.message));
    api.omw.getTransport().then((r) => setTransport(r.transport)).catch(() => {});
  }, []);

  const selected = useMemo(() => dests.find((d) => d.id === destId) || null, [dests, destId]);

  function pickDest(id) { setDestId(id); }

  async function start() {
    if (!destId) return;
    setError(null); setStatus('starting');
    try {
      const t = await startOmwTrip(destId); // transport = account's current
      setTrip(t); setStatus('tracking');
    } catch (e) {
      setError(e.message || 'Could not start — location permission?');
      setStatus('error');
    }
  }

  async function stop() {
    await stopOmwTrip();
    setTrip(null); setStatus('idle');
  }

  // Quick-action / Siri deep link (?omw=start) auto-fires the default slot once.
  useEffect(() => {
    if (autoStart && status === 'idle' && destId) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, destId]);

  const running = status === 'tracking' || (activeOmwTripId() != null);

  return (
    <div className={`rounded-2xl border p-4 ${card}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">On My Way · Test Harness</h2>
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">v1 · loops to you</span>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        Tracks your live progress along the route to the chosen destination. Only you see it. Manage destinations on
        your <span className="font-medium">Account</span> page.
      </p>

      {dests.length === 0 ? (
        <p className="mt-3 text-xs text-neutral-400">No quick destinations yet — add one on your Account page.</p>
      ) : (
        <>
          {!running && (
            <div className="mt-3 space-y-2">
              <select
                value={destId}
                onChange={(e) => pickDest(e.target.value)}
                className="block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:bg-neutral-800 dark:border-neutral-700"
              >
                {dests.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.position === 1 ? '★ ' : ''}{d.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-neutral-500">
                Transport: <span className="font-medium capitalize">{transport}</span> — change it on your Account page.
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            {!running ? (
              <button
                type="button"
                onClick={start}
                disabled={!destId || status === 'starting'}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {status === 'starting' ? 'Getting location…' : "I'm on my way"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white"
              >
                End trip
              </button>
            )}
            {running && trip && (
              <span className="text-xs text-neutral-500">
                {trip.dest_label} · {Number(trip.distance_total_km).toFixed(2)} km · ~{Math.round((trip.eta_seconds || 0) / 60)} min
              </span>
            )}
            {!running && selected && (
              <span className="text-xs text-neutral-400">to {selected.label}</span>
            )}
          </div>
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-3 text-[11px] text-neutral-400">
        Tip: to test without a ride, add a nearby destination on your Account page, or use the iOS Simulator’s
        <span className="font-medium"> Features → Location → City Bicycle Ride</span>.
      </p>
    </div>
  );
}
