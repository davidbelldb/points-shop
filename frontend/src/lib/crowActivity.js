import { Capacitor, registerPlugin } from '@capacitor/core';
import { api } from './api.js';

// Bridge to the native CrowActivityPlugin. The crow Live Activity is now fully
// server-driven (push-to-start + push-update via APNs), so the app's only job is
// to hand the push tokens to the backend — it no longer starts/ends activities
// locally (which would double up with the pushed one).
const Native = registerPlugin('CrowActivity');

let wired = false;

/** Register for push-to-start + per-activity update tokens and ship them to the
 *  backend. Safe to call repeatedly; native + web no-op outside iOS. */
export function enableCrowPush() {
  if (!Capacitor.isNativePlatform() || wired) return;
  wired = true;
  try {
    Native.addListener('ptsToken', ({ token, environment }) => {
      api.registerLiveActivityToken('pts', token, null, environment).catch(() => {});
    });
    Native.addListener('updateToken', ({ scrollId, token, environment }) => {
      api.registerLiveActivityToken('update', token, scrollId, environment).catch(() => {});
    });
    Native.enablePush();
  } catch { /* plugin unavailable — ignore */ }
}
