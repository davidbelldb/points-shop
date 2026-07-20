import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { startOmwTrip, stopOmwTrip, activeOmwTripId } from '../../lib/omwActivity.js';

/*
 * "On My Way" — /new-chat test harness panel.
 *
 * Sits below the scrolls area. Triggering starts a trip from your current
 * location toward your configured destination; the Live Activity loops back to
 * your own device (v1 self-test), so you can watch the banner advance as you
 * move. Location pings come from the native background plugin and a foreground
 * watchPosition fallback (see lib/omwActivity.js).
 */
export default function OmwTestPanel({ dark, autoStart }) {
  const [dest, setDest] = useState(null);
  const [trip, setTrip] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | starting | tracking | error
  const [error, setError] = useState(null);

  const card = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200';

  useEffect(() => {
    api.omw.myDestination()
      .then((r) => setDest(r.destination))
      .catch((e) => setError(e.message));
  }, []);

  async function start() {
    setError(null); setStatus('starting');
    try {
      const t = await startOmwTrip();
      setTrip(t);
      setStatus('tracking');
    } catch (e) {
      setError(e.message || 'Could not start — location permission?');
      setStatus('error');
    }
  }

  async function stop() {
    await stopOmwTrip();
    setTrip(null);
    setStatus('idle');
  }

  // Quick-action / Siri deep link (?omw=start) auto-triggers a trip once.
  useEffect(() => {
    if (autoStart && status === 'idle' && dest) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, dest]);

  const running = status === 'tracking' || (activeOmwTripId() != null);

  return (
    <div className={`rounded-2xl border p-4 ${card}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">On My Way · Test Harness</h2>
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">v1 · loops to you</span>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        Starts a Live Activity tracking your live progress toward your destination. Only you see it for now.
      </p>

      <div className="mt-3 text-xs">
        <span className="text-neutral-500">Destination: </span>
        {dest ? (
          <span className="font-medium">
            {dest.label}
            <span className="ml-1 text-[10px] text-neutral-400">
              ({Number(dest.lat).toFixed(4)}, {Number(dest.lng).toFixed(4)})
            </span>
          </span>
        ) : (
          <span className="text-neutral-400">none set — add one in Admin → On My Way</span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {!running ? (
          <button
            type="button"
            onClick={start}
            disabled={!dest || status === 'starting'}
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
            Tracking · {Number(trip.distance_total_km).toFixed(2)} km to go
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-3 text-[11px] text-neutral-400">
        Tip: to test without a bike ride, temporarily set your destination in Admin very close to where you are,
        or use the iOS Simulator’s <span className="font-medium">Features → Location → City Bicycle Ride</span>.
      </p>
    </div>
  );
}
