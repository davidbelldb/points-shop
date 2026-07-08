import { useState } from 'react';
import { nfcSupported, eraseNfcTag } from '../lib/nfc.js';

/*
 * NFC tools — wipe a tag. Writing a fresh story link already overwrites a tag,
 * so this is for clearing one you want to reuse or retire. Native iOS only.
 */
export default function AdminNfcSection() {
  const [state, setState] = useState('idle'); // idle | wiping | done | error
  const [msg, setMsg] = useState(null);
  const supported = nfcSupported();

  async function wipe() {
    if (state === 'wiping') return;
    setState('wiping'); setMsg(null);
    try {
      await eraseNfcTag();
      setState('done');
    } catch (e) {
      if (e?.message === 'cancelled') { setState('idle'); return; }
      setState('error');
      setMsg(e?.message || 'Could not wipe the tag.');
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Wipe an NFC tag so it can be reused. Writing a new hidden-story link to a
        tag already overwrites whatever was on it — this just clears one.
      </p>

      {!supported ? (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/40">
          Open the app on your iPhone to wipe tags.
        </p>
      ) : (
        <>
          <button
            onClick={wipe}
            disabled={state === 'wiping'}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
            </svg>
            {state === 'wiping' ? 'Hold near the tag…' : state === 'done' ? 'Tag wiped ✓' : 'Wipe a tag'}
          </button>
          {state === 'error' && msg && <p className="text-sm text-red-600">{msg}</p>}
        </>
      )}
    </div>
  );
}
