import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

function Avatar({ url, name, size = 'sm' }) {
  const cls = size === 'lg' ? 'h-16 w-16' : 'h-8 w-8';
  const iconSize = size === 'lg' ? 24 : 16;
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

function ThumbsUp({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l5-7s2 1 2 2.88Z" />
    </svg>
  );
}

function LikedByLabel({ likedBy, currentUserId }) {
  if (!likedBy || likedBy.length === 0) return null;
  const labels = likedBy.map((u) => (u.id === currentUserId ? 'You' : (u.name || u.username)));
  let text;
  if (labels.length === 1) text = `${labels[0]} liked this`;
  else if (labels.length === 2) text = `${labels[0]} and ${labels[1]} liked this`;
  else text = `${labels[0]} and ${labels.length - 1} others liked this`;
  return <p className="text-xs text-neutral-500">{text}</p>;
}

export default function ProductReviews({ productId }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');

  async function load() {
    try {
      const data = await api.listReviews(productId);
      setReviews(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
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

  async function toggleLike(reviewId, currentlyLiked) {
    if (!user) return;
    setReviews((rs) =>
      (rs ?? []).map((r) => {
        if (r.id !== reviewId) return r;
        const liked_by = currentlyLiked
          ? (r.liked_by ?? []).filter((u) => u.id !== user.id)
          : [...(r.liked_by ?? []), { id: user.id, name: user.name, photo_url: user.photo_url, username: user.username }];
        return { ...r, liked_by };
      })
    );
    try {
      if (currentlyLiked) await api.unlikeReview(reviewId);
      else await api.likeReview(reviewId);
      await load();
    } catch (e) {
      await load();
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">
        Reviews{reviews ? ` (${reviews.length})` : ''}
      </h2>

      {reviews !== null && (
        reviews.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing yet. Be brutal.</p>
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => {
              const liked = (r.liked_by ?? []).some((u) => u.id === user?.id);
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
                    {editingId !== r.id && (
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
                        <button onClick={() => setEditingId(null)} className="text-sm text-neutral-500">Cancel</button>
                        <button
                          onClick={saveEdit}
                          disabled={busy || !editDraft.trim()}
                          className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-amber-900 disabled:opacity-40"
                        >Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{r.body}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <LikedByLabel likedBy={r.liked_by} currentUserId={user?.id} />
                        <button
                          onClick={() => toggleLike(r.id, liked)}
                          className={`flex items-center gap-1 text-sm transition ${liked ? 'text-amber-700' : 'text-neutral-400 hover:text-amber-700'}`}
                          aria-label={liked ? 'Remove thumbs up' : 'Give thumbs up'}
                        >
                          <ThumbsUp filled={liked} />
                          <span>{(r.liked_by ?? []).length || ''}</span>
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <Avatar url={user?.photo_url} name={user?.name} size="lg" />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tell him how you really feel..."
            rows={2}
            className="block h-16 flex-1 resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={busy || !draft.trim()}
            className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40"
          >
            Post
          </button>
        </div>
      </div>
    </section>
  );
}
