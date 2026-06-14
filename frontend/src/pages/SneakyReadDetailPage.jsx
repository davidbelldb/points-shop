import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

/* ---- Cover placeholder for entries with no artwork ---- */
function CoverFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-900 text-neutral-500">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z" />
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      </svg>
    </div>
  );
}

function PriorityPicker({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-8 w-8 rounded-md text-sm font-bold transition ${
            n <= value ? 'bg-amber-400 text-amber-900' : 'bg-neutral-100 text-neutral-400'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function SneakyReadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null); // { item, detail }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [priority, setPriority] = useState(3);
  const [read, setRead] = useState(false);

  useEffect(() => {
    api.readsGet(id)
      .then((d) => {
        setData(d);
        setPriority(d.item.priority);
        setRead(d.item.read);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.updateRead(id, { priority, read });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!data || !confirm(`Remove "${data.item.title}" from the list?`)) return;
    setBusy(true);
    try {
      await api.deleteRead(id);
      navigate('/sneaky-reads');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/sneaky-reads" className="text-sm text-neutral-500">Back to reading list</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!data) return <p className="py-6 text-sm text-neutral-500">Loading...</p>;

  const { item, detail } = data;
  const pageCount = item.page_count ?? detail?.page_count ?? null;
  const genres = item.genres?.length ? item.genres : (detail?.subjects || []);
  const rating = item.rating ?? detail?.rating ?? null;

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/sneaky-reads" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="truncate px-2 text-lg font-semibold tracking-tight">{item.title}</h1>
        <span className="w-10" />
      </div>

      {/* Cover + meta */}
      <div className="flex gap-3">
        <div className="h-44 w-28 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
          {item.cover_url ? (
            <img src={item.cover_url} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <CoverFallback />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="font-semibold">{item.title}</p>
          {item.author && <p className="text-neutral-500">{item.author}</p>}
          <p className="text-neutral-500">
            {rating ? `★ ${Number(rating).toFixed(1)}` : ''}
            {pageCount ? `${rating ? ' · ' : ''}${pageCount} pages` : ''}
            {detail?.published_date ? `${rating || pageCount ? ' · ' : ''}${detail.published_date}` : ''}
          </p>
          {detail?.publisher && <p className="text-neutral-400">{detail.publisher}</p>}
          {genres?.length > 0 && <p className="text-neutral-400">{genres.join(', ')}</p>}
        </div>
      </div>

      {/* Reading plan */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Reading plan</h2>
          {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
        </div>
        <div>
          <span className="text-xs text-neutral-500">Priority</span>
          <PriorityPicker value={priority} onChange={setPriority} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="h-4 w-4" />
          Finished
        </label>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-xl bg-teal-300 py-2.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40"
          >
            Save changes
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-500 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </section>

      {/* Description */}
      {detail?.description && (
        <section className="space-y-1">
          <h2 className="text-base font-semibold">Description</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{detail.description}</p>
        </section>
      )}

      {/* Editions */}
      {detail?.editions?.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Editions</h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {detail.editions.map((e, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.publishers?.join(', ') || 'Unknown publisher'}</p>
                  <p className="text-xs text-neutral-500">
                    {e.publish_date || 'Date unknown'}
                    {e.number_of_pages ? ` · ${e.number_of_pages}pp` : ''}
                    {e.isbn_13 ? ` · ISBN ${e.isbn_13}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!detail && (
        <p className="text-sm text-neutral-400">No extra details — this title was added as free text without a catalogue match.</p>
      )}
    </div>
  );
}
