import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useBasket } from '../lib/BasketContext.jsx';

const POLL_MS = 5000;
const DOUBLE_TAP_MS = 240;

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

/* One chat bubble — handles its own tap/double-tap discrimination.
   - double-tap (any bubble): toggles the purple-heart reaction
   - single-tap (your own bubble): opens edit mode
   - single-tap on the other person's bubble: ignored
   The X (delete) and the edit pencil stop propagation so they don't fire taps. */
function MessageBubble({ m, mine, isEditing, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onToggleHeart }) {
  const tapTimer = useRef(null);
  const [draft, setDraft] = useState(m.body);

  useEffect(() => { if (isEditing) setDraft(m.body); }, [isEditing, m.body]);
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  function handleClick(e) {
    if (isEditing) return; // taps go to the input while editing
    // Ignore taps on internal action buttons.
    if (e.target.closest('[data-bubble-action]')) return;
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      onToggleHeart();
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        if (mine) onStartEdit();
      }, DOUBLE_TAP_MS);
    }
  }

  const tone = mine
    ? 'rounded-br-sm bg-amber-100 text-amber-900'
    : 'rounded-bl-sm bg-pink-100 text-pink-900';

  return (
    <div
      onClick={handleClick}
      className={`group relative max-w-[78%] cursor-pointer select-none rounded-2xl px-3 py-2 ${tone}`}
    >
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={2}
            className="block w-full resize-none rounded-md border border-amber-200 bg-white/70 px-2 py-1 text-sm text-neutral-900 focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex justify-end gap-2 text-xs font-semibold">
            <button
              data-bubble-action
              onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}
              className="rounded-md px-2 py-1 text-neutral-600 hover:bg-white/40"
            >
              Cancel
            </button>
            <button
              data-bubble-action
              disabled={!draft.trim() || draft === m.body}
              onClick={(e) => { e.stopPropagation(); onSaveEdit(draft); }}
              className="rounded-md bg-amber-600 px-2 py-1 text-amber-900 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
          <p className="mt-1 text-[10px] opacity-50">
            {m.edited_at && <span>edited {'·'} </span>}
            {timeLabel(m.created_at)}
          </p>
          {mine && (
            <button
              data-bubble-action
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-white/40 text-amber-900 group-hover:flex"
              aria-label="Delete"
            >
              {'×'}
            </button>
          )}
          {m.reaction === 'heart' && (
            <span
              className={`pointer-events-none absolute -bottom-2 ${mine ? 'left-1' : 'right-1'} text-base leading-none`}
              style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}
              aria-label="Purple heart reaction"
            >
              {'💜'}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { refresh: refreshBasket } = useBasket();
  const [data, setData] = useState({ other: null, messages: [] });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const bottomRef = useRef(null);
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
    if (data.messages.length > lastCountRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    lastCountRef.current = data.messages.length;
  }, [data.messages.length]);

  async function send(e) {
    if (e?.preventDefault) e.preventDefault();
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

  async function saveEdit(id, body) {
    try {
      await api.editMessage(id, body);
      setEditingId(null);
      await refresh(false);
    } catch (e) { setError(e.message); }
  }

  // Optimistically flip the reaction locally, then sync with the server.
  async function toggleHeart(id) {
    const current = data.messages.find((x) => x.id === id);
    if (!current) return;
    const next = current.reaction === 'heart' ? null : 'heart';
    setData((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (m.id === id ? { ...m, reaction: next } : m)),
    }));
    try { await api.setMessageReaction(id, next); }
    catch (e) {
      setError(e.message);
      await refresh(false); // re-sync on failure
    }
  }

  let lastDay = null;

  return (
    <>
      <div className="space-y-3 pb-24">
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
          <p className="text-sm text-neutral-500">It's looking a bit bare {'—'} like your backside.</p>
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
                    <MessageBubble
                      m={m}
                      mine={mine}
                      isEditing={editingId === m.id}
                      onStartEdit={() => setEditingId(m.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={(body) => saveEdit(m.id, body)}
                      onDelete={() => remove(m.id)}
                      onToggleHeart={() => toggleHeart(m.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div ref={bottomRef} aria-hidden style={{ scrollMarginBottom: '7rem' }} />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-neutral-200 bg-neutral-50/95 backdrop-blur supports-[padding:env(safe-area-inset-bottom)]:pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-md px-4 py-3">
          <form onSubmit={send} className="flex items-stretch gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Say something..."
              autoComplete="off"
              className="block h-11 flex-1 rounded-2xl border border-neutral-200 bg-white px-4 text-sm focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="shrink-0 h-11 rounded-2xl bg-amber-600 px-5 text-sm font-semibold text-amber-900 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
