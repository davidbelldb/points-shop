import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;

export default function PushToggle() {
  const [state, setState] = useState('checking'); // checking|unsupported|needs-install|blocked|off|on
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported) { setState('unsupported'); return; }
      if (isIOS() && !isStandalone()) { setState('needs-install'); return; }
      if (Notification.permission === 'denied') { setState('blocked'); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? 'on' : 'off');
      } catch {
        if (!cancelled) setState('off');
      }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  async function enable() {
    setBusy(true); setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await api.getVapidKey();
      if (!key) throw new Error('Push is not set up on the server yet.');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await api.savePushSubscription(sub.toJSON());
      setState('on');
    } catch (e) {
      setError(e.message || 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.removePushSubscription(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setError(e.message || 'Could not turn off notifications.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'checking') return null;

  return (
    <section className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="text-xs text-neutral-500">
            {state === 'on'
              ? 'On — this device gets pushed updates.'
              : 'Get a push for new messages, your turn in a game, and order updates.'}
          </p>
        </div>
        {state === 'on' && (
          <button
            onClick={disable}
            disabled={busy}
            className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 disabled:opacity-40"
          >
            Turn off
          </button>
        )}
        {state === 'off' && (
          <button
            onClick={enable}
            disabled={busy}
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Enabling...' : 'Enable'}
          </button>
        )}
      </div>
      {state === 'needs-install' && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          To get notifications on iPhone, add this site to your Home Screen first: tap Share in
          Safari, then &quot;Add to Home Screen&quot;. Open it from that icon and this option appears.
        </p>
      )}
      {state === 'blocked' && (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
          Notifications are blocked. Turn them on for this site in your device settings, then reload.
        </p>
      )}
      {state === 'unsupported' && (
        <p className="text-xs text-neutral-500">This device does not support push notifications.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
