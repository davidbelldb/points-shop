import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api.js';

// Native iOS push (APNs) registration. No-op on the web build, where push is
// handled by the service worker / Web Push (see PushToggle.jsx).

let listenersWired = false;
let lastToken = null;

/**
 * Ask for permission, register with APNs, and ship the device token to the
 * backend. Safe to call repeatedly (idempotent). `onOpenUrl` is invoked when
 * the user taps a notification, with the deep-link path from its payload.
 */
export async function initNativePush(onOpenUrl) {
  if (!Capacitor.isNativePlatform()) return;

  if (!listenersWired) {
    listenersWired = true;

    PushNotifications.addListener('registration', (token) => {
      lastToken = token.value;
      api.registerApnsToken(token.value).catch(() => {});
    });

    PushNotifications.addListener('registrationError', () => {
      // Leave it — the user can retry by reopening; nothing actionable here.
    });

    // Tap on a notification (foreground or background) → deep-link in the app.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action?.notification?.data?.url;
      if (url && typeof onOpenUrl === 'function') onOpenUrl(url);
    });
  }

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return;

  await PushNotifications.register();
}

/**
 * Drop this device's token from the backend on logout so a logged-out / shared
 * device doesn't keep receiving the previous user's notifications.
 */
export async function unregisterNativePush() {
  if (!Capacitor.isNativePlatform() || !lastToken) return;
  try { await api.unregisterApnsToken(lastToken); } catch { /* ignore */ }
}
