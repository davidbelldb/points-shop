import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm focus:border-amber-500 focus:outline-none ' +
  'dark:border-neutral-600 dark:bg-neutral-800 dark:text-white';

function possessive(name) {
  if (!name) return 'My';
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

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
            n <= value ? 'bg-amber-400 text-amber-900' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* ---- One cover card ---- */
function ItemCard({ it, busy, onToggleRead, onRemove }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 ${it.read ? 'opacity-60' : ''}`}>
      <div className="relative aspect-[2/3] bg-neutral-900">
        {it.cover_url ? (
          <img src={it.cover_url} alt={it.title} className="h-full w-full object-cover" />
        ) : (
          <CoverFallback />
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
          P{it.priority}
        </span>
        {it.read && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
            Read
          </span>
        )}
      </div>
      <div className="space-y-1 p-2">
        <p className="truncate text-sm font-medium dark:text-white" title={it.title}>{it.title}</p>
        <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400" title={it.author || ''}>
          {it.author || 'Unknown author'}
        </p>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {it.rating ? `★ ${Number(it.rating).toFixed(1)}` : ''}
          {it.page_count ? `${it.rating ? ' · ' : ''}${it.page_count}pp` : ''}
        </p>
        {it.genres?.length > 0 && (
          <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">{it.genres.join(', ')}</p>
        )}
        <div className="flex gap-1 pt-1">
          <button
            onClick={() => onToggleRead(it)}
            disabled={busy}
            className="flex-1 rounded-md bg-neutral-100 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
          >
            {it.read ? 'To read' : 'Read'}
          </button>
          <button
            onClick={() => onRemove(it)}
            disabled={busy}
            aria-label="Remove"
            className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-400 hover:border-red-300 hover:text-red-600 disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-500"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- A list section (To read / Finished) with its own sort ---- */
function Section({ heading, items, sort, setSort, emptyText, busy, onToggleRead, onRemove }) {
  const sorted = useMemo(() => {
    const arr = [...items];
    if (sort === 'az') {
      arr.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      arr.sort((a, b) => (b.priority - a.priority) || (new Date(b.created_at) - new Date(a.created_at)));
    }
    return arr;
  }, [items, sort]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold dark:text-white">{heading} <span className="text-sm font-normal text-neutral-400 dark:text-neutral-500">({items.length})</span></h2>
        <select
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="priority">Priority</option>
          <option value="az">A-Z</option>
        </select>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-9 gap-3">
          {sorted.map((it) => (
            <ItemCard key={it.id} it={it} busy={busy} onToggleRead={onToggleRead} onRemove={onRemove} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function SneakyReadsPage() {
  const { account } = useBasket();
  const title = `${possessive(account?.name)} reading list`;

  const [partnerName, setPartnerName] = useState('them');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  /* ---- add form state ---- */
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [priority, setPriority] = useState(3);
  const [suggestPartner, setSuggestPartner] = useState(false);
  const searchTimer = useRef(null);

  /* ---- filter + sort state ---- */
  const [genreFilter, setGenreFilter] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [toReadSort, setToReadSort] = useState('priority');
  const [readSort, setReadSort] = useState('priority');

  async function load() {
    try { setItems(await api.readsList()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => {
    load();
    api.readsPartner().then((p) => p?.name && setPartnerName(p.name)).catch(() => {});
  }, []);

  /* ---- debounced Google Books search ---- */
  useEffect(() => {
    if (picked) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchText.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.readsSearch(q);
        setSearchResults(res.results || []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchText, picked]);

  function pickResult(r) {
    setPicked(r);
    setSearchResults([]);
    setSearchText(r.title);
  }

  function pickFreeText() {
    const t = searchText.trim();
    if (!t) return;
    setPicked({ title: t, freeText: true });
    setSearchResults([]);
  }

  function resetForm() {
    setPicked(null);
    setSearchText('');
    setSearchResults([]);
    setPriority(3);
    setSuggestPartner(false);
  }

  async function addItem() {
    if (!picked) return;
    setBusy(true); setError(null);
    try {
      await api.addRead({
        google_books_id: picked.google_books_id ?? null,
        title: picked.title,
        author: picked.author ?? null,
        cover_url: picked.cover_url ?? null,
        genres: picked.genres ?? [],
        rating: picked.rating ?? null,
        page_count: picked.page_count ?? null,
        priority,
        suggest_to_partner: suggestPartner,
      });
      resetForm();
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function toggleRead(item) {
    setBusy(true);
    try { await api.updateRead(item.id, { read: !item.read }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    if (!confirm(`Remove "${item.title}" from the list?`)) return;
    setBusy(true);
    try { await api.deleteRead(item.id); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function acceptSuggestion(item) {
    setBusy(true); setError(null);
    try { await api.updateRead(item.id, { suggested: false }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function dismissSuggestion(item) {
    setBusy(true); setError(null);
    try { await api.deleteRead(item.id); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const suggestions = useMemo(() => (items || []).filter((it) => it.suggested), [items]);

  const allGenres = useMemo(() => {
    const s = new Set();
    (items || []).forEach((it) => (it.genres || []).forEach((g) => s.add(g)));
    return [...s].sort();
  }, [items]);

  const filtered = useMemo(() => {
    return (items || []).filter((it) => {
      if (it.suggested) return false;
      if (genreFilter && !(it.genres || []).includes(genreFilter)) return false;
      if (minRating > 0 && (it.rating == null || Number(it.rating) < minRating)) return false;
      return true;
    });
  }, [items, genreFilter, minRating]);

  const toReadItems = useMemo(() => filtered.filter((it) => !it.read), [filtered]);
  const readItems = useMemo(() => filtered.filter((it) => it.read), [filtered]);

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/account" className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight dark:text-white">{title}</h1>
        <span className="w-10" />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      {/* ---- Suggested reads ---- */}
      {suggestions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold dark:text-white">Suggested reads <span className="text-sm font-normal text-neutral-400 dark:text-neutral-500">({suggestions.length})</span></h2>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-2 dark:border-teal-800 dark:bg-teal-900/20"
              >
                <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-700">
                  {s.cover_url ? <img src={s.cover_url} alt="" className="h-full w-full object-cover" /> : <CoverFallback />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-teal-900 dark:text-teal-200">{s.title}</p>
                  <p className="truncate text-xs text-teal-700 dark:text-teal-400">
                    {s.author ? `${s.author} · ` : ''}{s.suggested_by_name || partnerName} thought you&apos;d like this
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => dismissSuggestion(s)}
                    disabled={busy}
                    className="rounded-lg border border-teal-300 px-2.5 py-1.5 text-xs font-semibold text-teal-900 disabled:opacity-40 dark:border-teal-700 dark:text-teal-200"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => acceptSuggestion(s)}
                    disabled={busy}
                    className="rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-semibold text-teal-900 disabled:opacity-40 dark:bg-teal-400 dark:text-teal-950"
                  >
                    Add to my list
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Add form ---- */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <h2 className="text-sm font-semibold dark:text-white">Add a book</h2>

        {!picked ? (
          <div className="relative">
            <input
              className={inputCls}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Start typing a title..."
            />
            {(searchResults.length > 0 || (searchText.trim().length >= 2 && !searching)) && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
                {searchResults.map((r) => (
                  <button
                    key={r.google_books_id}
                    onClick={() => pickResult(r)}
                    className="flex w-full items-center gap-3 border-b border-neutral-100 p-2 text-left last:border-0 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-700"
                  >
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-700">
                      {r.cover_url ? <img src={r.cover_url} alt="" className="h-full w-full object-cover" /> : <CoverFallback />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium dark:text-white">{r.title}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {r.author || 'Unknown author'}{r.year ? ` · ${r.year}` : ''}
                        {r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ''}
                      </p>
                      {r.genres?.length > 0 && (
                        <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">{r.genres.join(', ')}</p>
                      )}
                    </div>
                  </button>
                ))}
                <button
                  onClick={pickFreeText}
                  className="block w-full p-2 text-left text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-neutral-700"
                >
                  Use &ldquo;{searchText.trim()}&rdquo; as typed
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-neutral-50 p-2 dark:bg-neutral-900">
            <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-700">
              {picked.cover_url ? <img src={picked.cover_url} alt="" className="h-full w-full object-cover" /> : <CoverFallback />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold dark:text-white">{picked.title}</p>
              {picked.author && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{picked.author}</p>}
              {picked.genres?.length > 0 && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{picked.genres.join(', ')}</p>}
              {picked.rating ? <p className="text-xs text-neutral-500 dark:text-neutral-400">★ {picked.rating.toFixed(1)}</p> : null}
            </div>
            <button onClick={resetForm} className="shrink-0 text-xs font-medium text-neutral-500 hover:text-red-600 dark:text-neutral-400">Change</button>
          </div>
        )}

        {picked && (
          <>
            <div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">Priority</span>
              <PriorityPicker value={priority} onChange={setPriority} />
            </div>
            <label className="flex items-center gap-2 text-sm dark:text-neutral-200">
              <input type="checkbox" checked={suggestPartner} onChange={(e) => setSuggestPartner(e.target.checked)} className="h-4 w-4" />
              Suggest to {partnerName}?
            </label>
            <button
              onClick={addItem}
              disabled={busy}
              className="w-full rounded-xl bg-teal-300 py-2.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40"
            >
              Add to list
            </button>
          </>
        )}
      </section>

      {/* ---- Global filters ---- */}
      {items && items.length > 0 && (
        <div className="flex gap-2">
          <select className={inputCls} value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
            <option value="">All genres</option>
            {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className={inputCls} value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
            <option value={0}>Any rating</option>
            {[3, 3.5, 4, 4.5].map((s) => <option key={s} value={s}>{s}+ rating</option>)}
          </select>
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing on the list yet. Add something above!</p>
      ) : (
        <>
          <Section
            heading="To read"
            items={toReadItems}
            sort={toReadSort}
            setSort={setToReadSort}
            emptyText="Nothing to read matches those filters."
            busy={busy}
            onToggleRead={toggleRead}
            onRemove={remove}
          />
          <Section
            heading="Finished"
            items={readItems}
            sort={readSort}
            setSort={setReadSort}
            emptyText="Nothing finished yet matches those filters."
            busy={busy}
            onToggleRead={toggleRead}
            onRemove={remove}
          />
        </>
      )}
    </div>
  );
}
