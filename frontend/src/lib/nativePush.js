import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App as CapApp } from '@capacitor/app';
import { api } from './api.js';

// Native iOS push (APNs) registration. No-op on the web build, where push is
// handled by the service worker / Web Push (see PushToggle.jsx).

let listenersWired = false;
let registered = false;
let lastToken = null;

// Bring-up diagnostics: mirror the registration lifecycle to the backend logs,
// since these events are otherwise invisible on a TestFlight device.
function report(event, detail) {
  try { api.apnsDebug(event, detail == null ? null : String(detail)); } catch { /* ignore */ }
}

/**
 * Ask for permission, register with APNs, and ship the device token to the
 * backend. Safe to call repeatedly (idempotent). `onOpenUrl` is invoked when
 * the user taps a notification, with the deep-link path from its payload.
 */
export async function initNativePush(onOpenUrl) {
  if (!Capacitor.isNativePlatform() || registered) return;

  if (!listenersWired) {
    listenersWired = true;

    PushNotifications.addListener('registration', (token) => {
      lastToken = token.value;
      report('registration', `token len ${token.value?.length}`);
      api.registerApnsToken(token.value)
        .then(() => report('register-saved', 'ok'))
        .catch((e) => report('register-save-failed', e?.message));
    });

    PushNotifications.addListener('registrationError', (err) => {
      report('registrationError', err?.error || JSON.stringify(err));
    });

    // Tap on a notification (foreground or background) → deep-link in the app.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      // Inline "Reply" from a chat banner: send the typed text straight away
      // (reuses the logged-in session), no need to open the conversation.
      const reply = action?.inputValue?.trim?.();
      if (action?.actionId === 'REPLY' && reply) {
        report('reply-from-banner', `len ${reply.length}`);
        api.sendMessage(reply).catch((e) => report('reply-from-banner-failed', e?.message));
        return;
      }
      const url = action?.notification?.data?.url;
      if (url && typeof onOpenUrl === 'function') onOpenUrl(url);
    });

    // Deep links into the app:
    //  • custom scheme (crow Live Activity → sneakystuff://messages)
    //  • https universal links (NFC tag / shared link → https://sneakypoints.com/s/<token>)
    // Both are reduced to an in-app path and handed to the router.
    CapApp.addListener('appUrlOpen', ({ url }) => {
      if (!url || typeof onOpenUrl !== 'function') return;
      report('app-url-open', url);
      try {
        let path;
        if (/^https?:\/\//i.test(url)) {
          const u = new URL(url);
          path = `${u.pathname}${u.search}`;
        } else {
          path = url.replace(/^sneakystuff:\/\//, '/');
        }
        path = `/${path.replace(/^\/+/, '')}`;
        onOpenUrl(path);
      } catch { /* ignore malformed url */ }
    });
  }

  report('init', `platform ${Capacitor.getPlatform()}`);
  try {
    let perm = await PushNotifications.checkPermissions();
    report('permission', perm.receive);
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
      report('permission-after-prompt', perm.receive);
    }
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();
    registered = true; // stop the effect from re-registering on every re-render
    report('register-called', 'ok');
  } catch (e) {
    report('init-error', e?.message);
  }
}

/**
 * Drop this device's token from the backend on logout so a logged-out / shared
 * device doesn't keep receiving the previous user's notifications.
 */
export async function unregisterNativePush() {
  if (!Capacitor.isNativePlatform() || !lastToken) return;
  registered = false; // allow re-registration on next login
  try { await api.unregisterApnsToken(lastToken); } catch { /* ignore */ }
}
