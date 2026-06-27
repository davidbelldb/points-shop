import { Capacitor, registerPlugin } from '@capacitor/core';
import { api } from './api.js';

// Bridge to the native crow Live Activity (CrowActivityPlugin.swift). All calls
// are best-effort no-ops on web or if the native plugin isn't present.
const Native = registerPlugin('CrowActivity');

const native = () => Capacitor.isNativePlatform();

// Temporary diagnostics — mirror the outcome to the backend logs AND broadcast
// an on-screen message (see the listener in CrowIncomingToast) so we can see
// exactly what happens without reading server logs.
function report(event, detail) {
  try { api.apnsDebug(event, detail == null ? null : String(detail)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('crow-activity-debug', { detail: `${event}${detail ? ': ' + detail : ''}` })); } catch { /* ignore */ }
}

/** Begin a flight: `seconds` until arrival, plus origin/dest labels. */
export async function startCrowActivity({ seconds, origin, dest }) {
  if (!native()) return;
  // NB: do NOT gate on isPluginAvailable — it gives false negatives for custom
  // app plugins. Just attempt the call and report the real outcome/error.
  try {
    const r = await Native.start({ seconds: Math.max(0, seconds || 0), origin: origin || '', dest: dest || '' });
    report('start-ok', `id=${r?.id ?? '?'}`);
  } catch (e) {
    report('start-failed', e?.message || String(e));
  }
}

/** Flip the activity to its "arrived" state, then it auto-dismisses. */
export async function landCrowActivity() {
  if (!native()) return;
  try { await Native.land(); report('crow-activity-land-ok', ''); }
  catch (e) { report('crow-activity-land-failed', e?.message || String(e)); }
}

/** Dismiss immediately (e.g. the scroll was opened/read). */
export async function endCrowActivity() {
  if (!native()) return;
  try { await Native.end(); } catch { /* ignore */ }
}
