/*
 * Shared on/off flag for the footprints SIMULATOR.
 *
 * The simulation itself runs on the /footprints map page (it needs the map, the wall
 * mask and the live calibration), but the START/STOP control lives in Admin → Marauder's
 * Map. This little store bridges the two: Admin flips the flag, the map page subscribes
 * and starts/stops the walk accordingly (and auto-starts it if the flag is already on
 * when the map opens).
 */

let on = false;
const listeners = new Set();

export const isSimOn = () => on;

export function setSimOn(value) {
  on = !!value;
  listeners.forEach((fn) => fn(on));
}

export function subscribeSim(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
