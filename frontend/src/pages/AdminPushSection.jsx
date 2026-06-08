import { useState } from 'react';
import { api } from '../lib/api.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-white';

export default function AdminPushSection() {
  const [title,  setTitle]  = useState('');
  const [body,   setBody]   = useState('');
  const [url,    setUrl]    = useState('');
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null); // { sent } or { error }

  async function send(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api.admin.pushBroadcast({ title: title.trim(), body: body.trim(), url: url.trim() || '/' });
      setResult({ sent: res.sent });
      setTitle('');
      setBody('');
      setUrl('');
    } catch (err) {
      setResult({ error: err.message ?? 'Failed to send' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Title</label>
        <input
          className={inputCls}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Hey there 👋"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Message</label>
        <textarea
          className={`${inputCls} resize-none`}
          rows={3}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Come check this out..."
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Link <span className="font-normal text-neutral-400">(optional — defaults to /)</span>
        </label>
        <input
          className={inputCls}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="/games"
        />
      </div>

      {result && (
        result.error
          ? <p className="text-sm text-red-500">{result.error}</p>
          : <p className="text-sm text-teal-600 dark:text-teal-400">
              Sent to {result.sent} subscriber{result.sent !== 1 ? 's' : ''} ✓
            </p>
      )}

      <button
        type="submit"
        disabled={busy || !title.trim() || !body.trim()}
        className="w-full rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 active:scale-95 disabled:opacity-40"
      >
        {busy ? 'Sending…' : 'Send push notification'}
      </button>
    </form>
  );
}
