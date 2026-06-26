import { Capacitor, registerPlugin } from '@capacitor/core';

// Bridge to the native crow Live Activity (CrowActivityPlugin.swift). All calls
// are best-effort no-ops on web or if the native plugin isn't present.
const Native = registerPlugin('CrowActivity');

const native = () => Capacitor.isNativePlatform();

/** Begin a flight: `seconds` until arrival, plus origin/dest labels. */
export async function startCrowActivity({ seconds, origin, dest }) {
  if (!native()) return;
  try { await Native.start({ seconds: Math.max(0, seconds || 0), origin: origin || '', dest: dest || '' }); }
  catch { /* Live Activities off / unsupported — ignore */ }
}

/** Flip the activity to its "arrived" state, then it auto-dismisses. */
export async function landCrowActivity() {
  if (!native()) return;
  try { await Native.land(); } catch { /* ignore */ }
}

/** Dismiss immediately (e.g. the scroll was opened/read). */
export async function endCrowActivity() {
  if (!native()) return;
  try { await Native.end(); } catch { /* ignore */ }
}
