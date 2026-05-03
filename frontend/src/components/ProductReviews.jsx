import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

function Avatar({ url, name }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400">
      {url ? (
        <img src={url} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )}
    </div>
  );
}

export default function ProductReviews({ productId }) {
  const { account } = useBasket();
  const [reviews, setReviews] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  async function load() {
    try { setReviews(await api.listReviews(productId)); }
    catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, [productId]);

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true); setError(null);
    try { await api.createReview(productId, draft); setDraft(''); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!editDraft.trim()) return;
    setBusy(true); setError(null);
    try { await api.updateReview(editingId, editDraft); setEditingId(null); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(id) {
    if (!confirm('Delete this review?')) return;
    setBusy(true); setError(null);
    try { await api.deleteReview(id); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">
        Reviews{reviews ? ` (${reviews.length})` : ''}
      </h2>

      <div className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex items-start gap-2">
          <Avatar url={account?.photo_url} name={account?.name} />
          <div className="flex-1">
            <p className="text-xs text-neutral-500">{account?.name ?? 'You'}</p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Your verdict..."
              rows={2}
              className="mt-1 block w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            onClick={submit}
            disabled={busy || !draft.trim()}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40"
          >
            Post review
          </button>
        </div>
      </div>

      {reviews === null ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing yet. Be brutal.</p>
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => {
            const isMine = r.account_id === account?.id;
            const date = new Date(r.created_at).toLocaleDateString(undefined, {
              year: 'numeric', month: 'short', day: 'numeric',
            });
            return (
              <li key={r.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <Avatar url={r.account_photo} name={r.account_name} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{r.account_name}</p>
                    <p className="text-xs text-neutral-500">{date}</p>
                  </div>
                  {isMine && editingId !== r.id && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setEditingId(r.id); setEditDraft(r.body); }}
                        className="text-xs font-medium text-amber-700"
                      >Edit</button>
                      <button
                        onClick={() => remove(r.id)}
                        className="text-xs text-neutral-400 hover:text-red-600"
                      >Delete</button>
                    </div>
                  )}
                </div>

                {editingId === r.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      className="block w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-sm text-neutral-500"
                      >Cancel</button>
                      <button
                        onClick={saveEdit}
                        disabled={busy || !editDraft.trim()}
                        className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-amber-900 disabled:opacity-40"
                      >Save</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{r.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
