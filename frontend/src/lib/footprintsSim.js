/*
 * Shared on/off flag for the footprints SIMULATOR.
 *
 * The simulation itself runs on the /footprints map page (it needs the map, the wall
 * mask and the live calibration), but the START/STOP control lives in Admin → Marauder's
 * Map. This little store bridges the two: Admin flips the flag, the map page subscribes
 * and starts/stops the walk accordingly (and auto-starts it if the flag is already on
 * when the map opens). Persisted to localStorage so the flag survives a reload/navigation
 * (native shell + PWA can reload the webview between pages) — otherwise it looked like the
 * Simulate toggle "forgot" it was on when you returned to the map.
 */

const KEY = 'footprintsSimOn';

function read() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }   // default: off
}

let on = read();
const listeners = new Set();

export const isSimOn = () => on;

export function setSimOn(value) {
  on = !!value;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(on));
}

export function subscribeSim(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
