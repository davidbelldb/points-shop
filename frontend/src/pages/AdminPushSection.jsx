import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-white';

function localDatetimeDefault() {
  // Return current local datetime in YYYY-MM-DDTHH:MM format for the input default
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  return now.toISOString().slice(0, 16);
}

export default function AdminPushSection() {
  const [title,        setTitle]        = useState('');
  const [body,         setBody]         = useState('');
  const [url,          setUrl]          = useState('');
  const [recipientId,  setRecipientId]  = useState('all');
  const [users,        setUsers]        = useState([]);
  const [schedule,     setSchedule]     = useState(false);
  const [scheduledFor, setScheduledFor] = useState(localDatetimeDefault());
  const [busy,         setBusy]         = useState(false);
  const [result,       setResult]       = useState(null);
  const [pending,      setPending]      = useState([]);
  const [dismissBusy,  setDismissBusy]  = useState(false);

  async function loadPending() {
    try {
      const res = await api.admin.pushScheduled();
      setPending(res.items ?? []);
    } catch {}
  }

  useEffect(() => {
    loadPending();
    api.admin.users().then(res => setUsers(res ?? [])).catch(() => {});
  }, []);

  async function send(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || '/',
        ...(recipientId !== 'all' ? { accountId: recipientId } : {}),
        ...(schedule ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      };
      const res = await api.admin.pushBroadcast(payload);
      if (res.scheduled) {
        setResult({ scheduled: true, scheduledFor: res.scheduledFor });
        loadPending();
      } else {
        setResult({ sent: res.sent });
      }
      setTitle(''); setBody(''); setUrl('');
    } catch (err) {
      setResult({ error: err.message ?? 'Failed to send' });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    try {
      await api.admin.pushCancelScheduled(id);
      loadPending();
    } catch {}
  }

  async function dismiss() {
    setDismissBusy(true);
    try {
      const res = await api.admin.pushDismiss();
      setResult({ dismissed: res.sent });
    } catch (err) {
      setResult({ error: err.message ?? 'Failed to dismiss' });
    } finally {
      setDismissBusy(false);
    }
  }

  function formatScheduledFor(iso) {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={send} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Title</label>
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Hey there 👋" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Message</label>
          <textarea className={`${inputCls} resize-none`} rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Come check this out..." required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Link <span className="font-normal text-neutral-400">(optional — defaults to /)</span>
          </label>
          <input className={inputCls} value={url} onChange={e => setUrl(e.target.value)} placeholder="/games" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Send to</label>
          <select className={inputCls} value={recipientId} onChange={e => setRecipientId(e.target.value)}>
            <option value="all">Everyone</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.username}</option>
            ))}
          </select>
        </div>

        {/* Schedule toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} className="rounded" />
          <span className="text-sm text-neutral-600 dark:text-neutral-300">Schedule for later</span>
        </label>

        {schedule && (
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Send at</label>
            <input
              type="datetime-local"
              className={inputCls}
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              required={schedule}
            />
          </div>
        )}

        {result && (
          result.error      ? <p className="text-sm text-red-500">{result.error}</p>
          : result.scheduled ? <p className="text-sm text-amber-600 dark:text-amber-400">Scheduled for {formatScheduledFor(result.scheduledFor)} ✓</p>
          : result.dismissed ? <p className="text-sm text-teal-600 dark:text-teal-400">Dismiss sent to {result.dismissed} device{result.dismissed !== 1 ? 's' : ''} ✓</p>
          : <p className="text-sm text-teal-600 dark:text-teal-400">Sent to {result.sent} subscriber{result.sent !== 1 ? 's' : ''} ✓</p>
        )}

        <button
          type="submit"
          disabled={busy || !title.trim() || !body.trim()}
          className="w-full rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 active:scale-95 disabled:opacity-40"
        >
          {busy ? 'Sending…' : schedule ? 'Schedule push' : 'Send push now'}
        </button>
      </form>

      {/* Dismiss button */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
        <p className="mb-1 text-xs text-neutral-400">Remove notification from devices (Android/Chrome only — iOS not supported)</p>
        <button
          onClick={dismiss}
          disabled={dismissBusy}
          className="w-full rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600 disabled:opacity-40"
        >
          {dismissBusy ? 'Dismissing…' : 'Dismiss notification from screens'}
        </button>
      </div>

      {/* Pending scheduled pushes */}
      {pending.length > 0 && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 space-y-2">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Scheduled ({pending.length})</p>
          {pending.map(p => (
            <div key={p.id} className="flex items-start justify-between gap-2 rounded-md bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-neutral-800 dark:text-neutral-100 truncate">{p.title}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatScheduledFor(p.scheduled_for)}</p>
              </div>
              <button
                onClick={() => cancel(p.id)}
                className="shrink-0 text-xs text-red-500 hover:text-red-700"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
