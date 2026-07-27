/*
 * Persisted flag for whether the on-map "Calibrate floorplan" button is shown.
 *
 * Controlled from Admin → Marauder's Map so the calibrator can be hidden once the
 * floorplan placement is set, and brought back for a tweak — without a code change.
 * Persisted to localStorage so the choice survives reloads; the /footprints map page
 * subscribes so it reacts live.
 */

const KEY = 'footprintsShowCalibrator';

function read() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }   // default: shown
}

let shown = read();
const listeners = new Set();

export const isCalibratorShown = () => shown;

export function setCalibratorShown(value) {
  shown = !!value;
  try { localStorage.setItem(KEY, shown ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(shown));
}

export function subscribeCalibrator(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
