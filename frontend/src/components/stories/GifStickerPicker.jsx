import { useEffect, useRef, useState } from 'react';

/* Giphy search bottom-sheet for placing a GIF sticker. Mirrors the chat GIF
   picker but reports back the GIF's url + aspect ratio (w/h) so the canvas can
   size it correctly. Uses the same VITE_GIPHY_API_KEY the chat already uses —
   Giphy keys are designed to be client-side. */
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY ?? '';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const PAGE_LIMIT = 24;

export default function GifStickerPicker({ onSelect, onClose, onRemove }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchGifs('', true);
    setTimeout(() => inputRef.current?.focus(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchGifs(term, reset = false) {
    if (!GIPHY_API_KEY) { setError('Giphy API key not configured.'); return; }
    const nextOffset = reset ? 0 : offset;
    setLoading(true);
    setError(null);
    try {
      const endpoint = term.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(term)}&limit=${PAGE_LIMIT}&offset=${nextOffset}&rating=g`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=${PAGE_LIMIT}&offset=${nextOffset}&rating=g`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Giphy ${res.status}`);
      const json = await res.json();
      const items = (json.data ?? []).map((r) => {
        const orig = r.images?.original ?? {};
        const w = Number(orig.width) || 200;
        const h = Number(orig.height) || 200;
        return {
          id: r.id,
          url: orig.url ?? r.url,
          preview: r.images?.fixed_height_small?.url ?? orig.url,
          aspect: h > 0 ? w / h : 1,
          title: r.title ?? '',
        };
      });
      setResults((prev) => reset ? items : [...prev, ...items]);
      setOffset(nextOffset + items.length);
    } catch (e) {
      setError(e.message || 'Could not load GIFs.');
    } finally {
      setLoading(false);
    }
  }

  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(val, true), 420);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="flex w-full max-w-md flex-col rounded-t-2xl bg-white sm:max-h-[80vh] sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-neutral-400">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={handleQueryChange}
            placeholder="Search GIFs…"
            className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-neutral-400"
          />
          {onRemove && (
            <button onClick={onRemove} className="shrink-0 text-sm font-semibold text-red-600">Remove</button>
          )}
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '55vh' }}>
          {error && <p className="py-8 text-center text-sm text-red-500">{error}</p>}
          {!error && results.length === 0 && !loading && (
            <p className="py-8 text-center text-sm text-neutral-400">No results</p>
          )}
          <div className="columns-2 gap-2 sm:columns-3">
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect(gif)}
                className="mb-2 block w-full overflow-hidden rounded-lg transition hover:opacity-90 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                title={gif.title}
              >
                <img src={gif.preview} alt={gif.title} loading="lazy" className="h-auto w-full object-cover" />
              </button>
            ))}
          </div>
          {results.length > 0 && results.length % PAGE_LIMIT === 0 && !loading && (
            <button onClick={() => fetchGifs(query, false)}
              className="mt-1 w-full rounded-xl border border-neutral-200 py-2 text-xs font-semibold text-neutral-500 hover:bg-neutral-50">
              Load more
            </button>
          )}
          {loading && (
            <div className="flex items-center justify-center py-6">
              <svg className="h-6 w-6 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          )}
        </div>

        <p className="px-3 py-1.5 text-[10px] text-neutral-400">Powered by GIPHY</p>
      </div>
    </div>
  );
}
