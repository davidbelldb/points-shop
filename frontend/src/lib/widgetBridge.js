import { Capacitor, registerPlugin } from '@capacitor/core';
import { api } from './api.js';

// Bridge to the native WidgetBridgePlugin (jsName "SneakyWidget"). The home /
// lock-screen widgets fetch the API themselves, so all the app has to do is
// hand them a bearer token to authenticate with, and nudge them to reload when
// something changes. No-ops on web.
const Native = registerPlugin('SneakyWidget');

// Canonical public origin — the widgets must hit the real domain, not the
// in-shell https://localhost the WebView runs on.
const API_BASE = 'https://sneakypoints.com';

let syncing = false;

/** Mint a widget token and store it (+ API base) in the shared App Group so the
 *  widgets can authenticate. Safe to call on every login; native-only. */
export async function syncWidgetCredentials() {
  if (!Capacitor.isNativePlatform() || syncing) return;
  syncing = true;
  try {
    const { token } = await api.widgetToken();
    if (token) await Native.setCredentials({ token, apiBase: API_BASE });
  } catch {
    /* plugin unavailable / not logged in — ignore */
  } finally {
    syncing = false;
  }
}

/** Ask the widgets to refresh (e.g. after adding a calendar event or finishing
 *  a Dirdle). Native-only; cheap and safe to call. */
export function reloadWidgets() {
  if (!Capacitor.isNativePlatform()) return;
  try { Native.reload(); } catch { /* ignore */ }
}

/** Drop the stored token on logout so the widgets stop showing data. */
export function clearWidgetCredentials() {
  if (!Capacitor.isNativePlatform()) return;
  try { Native.clear(); } catch { /* ignore */ }
}
