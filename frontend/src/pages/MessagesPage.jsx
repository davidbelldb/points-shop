import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useBasket } from '../lib/BasketContext.jsx';

const POLL_MS = 5000;

function Avatar({ url, name, size = 'md' }) {
  const cls = size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const iconSize = size === 'lg' ? 22 : 16;
  return (
    <div className={`flex ${cls} shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400`}>
      {url ? (
        <img src={url} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )}
    </div>
  );
}

function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { refresh: refreshBasket } = useBasket();
  const [data, setData] = useState({ other: null, messages: [] });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const lastCountRef = useRef(0);

  async function refresh(markRead = true) {
    try {
      const result = await api.getMessages();
      setData(result);
      if (markRead && result.messages.length > 0) {
        await api.markMessagesRead();
        await refreshBasket();
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => { if (mounted) await refresh(true); })();
    const id = setInterval(() => { if (mounted) refresh(true); }, POLL_MS);
    return () => { mounted = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data.messages.length > lastCountRef.current && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    lastCountRef.current = data.messages.length;
  }, [data.messages.length]);

  async function send() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(draft);
      setDraft('');
      await refresh(false);
      await refreshBasket();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this message?')) return;
    try { await api.deleteMessage(id); await refresh(false); }
    catch (e) { setError(e.message); }
  }

  let lastDay = null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {data.other && <Avatar url={data.other.photo_url} name={data.other.name} size="lg" />}
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              {data.other ? data.other.name : 'Messages'}
            </h1>
            {data.other && (
              <p className="text-xs text-neutral-500">@{data.other.username}</p>
            )}
          </div>
        </div>
        <Link to="/account" className="shrink-0 text-sm text-neutral-500">Back</Link>
      </div>

      {!data.other && (
        <p className="text-sm text-neutral-500">No one to chat with yet.</p>
      )}

      {data.other && data.messages.length === 0 && (
        <p className="text-sm text-neutral-500">Nothing here yet. Say something.</p>
      )}

      {data.messages.length > 0 && (
        <ul className="space-y-2">
          {data.messages.map((m) => {
            const mine = m.sender_id === user?.id;
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <li key={m.id}>
                {showDay && (
                  <p className="my-3 text-center text-xs font-medium uppercase tracking-wide text-neutral-400">
                    {day}
                  </p>
                )}
                <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  {!mine && <Avatar url={m.sender_photo} name={m.sender_name} />}
                  <div className={`group relative max-w-[78%] rounded-2xl px-3 py-2 ${
                    mine
                      ? 'rounded-br-sm bg-amber-100 text-amber-900'
                      : 'rounded-bl-sm bg-pink-100 text-pink-900'
                  }`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                    <p className="mt-1 text-[10px] opacity-50">{timeLabel(m.created_at)}</p>
                    {mine && (
                      <button
                        onClick={() => remove(m.id)}
                        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-white/40 text-amber-900 group-hover:flex"
                        aria-label="Delete"
                      >
                        {'\u00d7'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={scrollRef} />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-neutral-200 bg-neutral-50 px-4 pt-3">
        <div className="flex items-end gap-2 pb-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Say something..."
            rows={1}
            className="block max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy || !draft.trim()}
            className="shrink-0 rounded-2xl bg-amber-600 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
