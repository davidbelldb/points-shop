import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW = new Date();
const YEARS = [NOW.getFullYear(), NOW.getFullYear() + 1, NOW.getFullYear() + 2];

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm focus:border-amber-500 focus:outline-none';

function possessive(name) {
  if (!name) return 'My';
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

/* ---- Poster placeholder for free-text entries with no artwork ---- */
function PosterFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-900 text-neutral-500">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="18" rx="2" />
        <path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5" />
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

/* ---- One poster card ---- */
function ItemCard({ it, busy, onToggleWatched, onRemove }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-neutral-200 bg-white ${it.watched ? 'opacity-60' : ''}`}>
      <div className="relative aspect-[2/3] bg-neutral-900">
        {it.poster_url ? (
          <img src={it.poster_url} alt={it.title} className="h-full w-full object-cover" />
        ) : (
          <PosterFallback />
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
          P{it.priority}
        </span>
        {it.invite_partner && (
          <span className="absolute right-1.5 top-1.5 rounded bg-teal-300 px-1.5 py-0.5 text-[10px] font-bold text-teal-900">
            Invite
          </span>
        )}
        {it.watched && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
            Watched
          </span>
        )}
      </div>
      <div className="space-y-1 p-2">
        <p className="truncate text-sm font-medium" title={it.title}>{it.title}</p>
        <p className="text-[11px] text-neutral-500">
          {it.watch_month ? `${MONTHS[it.watch_month - 1]} ` : ''}{it.watch_year || ''}
          {it.tmdb_score ? ` · ${Number(it.tmdb_score).toFixed(1)}` : ''}
        </p>
        {it.genres?.length > 0 && (
          <p className="truncate text-[11px] text-neutral-400">{it.genres.join(', ')}</p>
        )}
        <div className="flex gap-1 pt-1">
          <button
            onClick={() => onToggleWatched(it)}
            disabled={busy}
            className="flex-1 rounded-md bg-neutral-100 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-40"
          >
            {it.watched ? 'To watch' : 'Watched'}
          </button>
          <button
            onClick={() => onRemove(it)}
            disabled={busy}
            aria-label="Remove"
            className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-400 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- A list section (To rewatch / To watch) with its own sort ---- */
function Section({ heading, items, sort, setSort, emptyText, busy, onToggleWatched, onRemove }) {
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
        <h2 className="text-base font-semibold">{heading} <span className="text-sm font-normal text-neutral-400">({items.length})</span></h2>
        <select className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="priority">Priority</option>
          <option value="az">A-Z</option>
        </select>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-400">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {sorted.map((it) => (
            <ItemCard key={it.id} it={it} busy={busy} onToggleWatched={onToggleWatched} onRemove={onRemove} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function RewatchListPage() {
  const { account } = useBasket();
  const title = `${possessive(account?.name)} watch list`;

  const [partnerName, setPartnerName] = useState('them');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  /* ---- add form state ---- */
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [tmdbConfigured, setTmdbConfigured] = useState(true);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [priority, setPriority] = useState(3);
  const [seenBefore, setSeenBefore] = useState(true);
  const [invitePartner, setInvitePartner] = useState(false);
  const searchTimer = useRef(null);

  /* ---- filter + sort state ---- */
  const [genreFilter, setGenreFilter] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [rewatchSort, setRewatchSort] = useState('priority');
  const [watchSort, setWatchSort] = useState('priority');

  async function load() {
    try { setItems(await api.rewatchList()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => {
    load();
    api.rewatchPartner().then((p) => p?.name && setPartnerName(p.name)).catch(() => {});
  }, []);

  /* ---- debounced TMDB search ---- */
  useEffect(() => {
    if (picked) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchText.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.rewatchSearch(q);
        setTmdbConfigured(res.configured !== false);
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
    setMonth(NOW.getMonth() + 1);
    setYear(NOW.getFullYear());
    setPriority(3);
    setSeenBefore(true);
    setInvitePartner(false);
  }

  async function addItem() {
    if (!picked) return;
    setBusy(true); setError(null);
    try {
      await api.addRewatch({
        tmdb_id: picked.tmdb_id ?? null,
        media_type: picked.media_type ?? null,
        title: picked.title,
        poster_url: picked.poster_url ?? null,
        genres: picked.genres ?? [],
        tmdb_score: picked.tmdb_score ?? null,
        watch_month: month,
        watch_year: year,
        priority,
        seen_before: seenBefore,
        invite_partner: invitePartner,
      });
      resetForm();
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function toggleWatched(item) {
    setBusy(true);
    try { await api.updateRewatch(item.id, { watched: !item.watched }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    if (!confirm(`Remove "${item.title}" from the list?`)) return;
    setBusy(true);
    try { await api.deleteRewatch(item.id); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const allGenres = useMemo(() => {
    const s = new Set();
    (items || []).forEach((it) => (it.genres || []).forEach((g) => s.add(g)));
    return [...s].sort();
  }, [items]);

  const filtered = useMemo(() => {
    return (items || []).filter((it) => {
      if (genreFilter && !(it.genres || []).includes(genreFilter)) return false;
      if (minScore > 0 && (it.tmdb_score == null || Number(it.tmdb_score) < minScore)) return false;
      return true;
    });
  }, [items, genreFilter, minScore]);

  const rewatchItems = useMemo(() => filtered.filter((it) => it.seen_before), [filtered]);
  const watchItems = useMemo(() => filtered.filter((it) => !it.seen_before), [filtered]);

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/account" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <span className="w-10" />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* ---- Add form ---- */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a film or TV show</h2>

        {!picked ? (
          <div className="relative">
            <input
              className={inputCls}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Start typing a title..."
            />
            {(searchResults.length > 0 || (searchText.trim().length >= 2 && !searching)) && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
                {searchResults.map((r) => (
                  <button
                    key={`${r.media_type}-${r.tmdb_id}`}
                    onClick={() => pickResult(r)}
                    className="flex w-full items-center gap-3 border-b border-neutral-100 p-2 text-left last:border-0 hover:bg-neutral-50"
                  >
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-neutral-100">
                      {r.poster_url ? <img src={r.poster_url} alt="" className="h-full w-full object-cover" /> : <PosterFallback />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-neutral-500">
                        {r.media_type === 'tv' ? 'TV' : 'Film'}{r.year ? ` · ${r.year}` : ''}
                        {r.tmdb_score ? ` · ${r.tmdb_score.toFixed(1)}` : ''}
                      </p>
                      {r.genres?.length > 0 && (
                        <p className="truncate text-[11px] text-neutral-400">{r.genres.join(', ')}</p>
                      )}
                    </div>
                  </button>
                ))}
                <button
                  onClick={pickFreeText}
                  className="block w-full p-2 text-left text-xs font-medium text-amber-700 hover:bg-amber-50"
                >
                  Use &ldquo;{searchText.trim()}&rdquo; as typed
                </button>
              </div>
            )}
            {!tmdbConfigured && (
              <p className="mt-1 text-xs text-neutral-400">Title search is offline — you can still add titles by typing them.</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-neutral-50 p-2">
            <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-neutral-100">
              {picked.poster_url ? <img src={picked.poster_url} alt="" className="h-full w-full object-cover" /> : <PosterFallback />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{picked.title}</p>
              {picked.genres?.length > 0 && <p className="truncate text-xs text-neutral-500">{picked.genres.join(', ')}</p>}
              {picked.tmdb_score ? <p className="text-xs text-neutral-500">Score {picked.tmdb_score.toFixed(1)}</p> : null}
            </div>
            <button onClick={resetForm} className="shrink-0 text-xs font-medium text-neutral-500 hover:text-red-600">Change</button>
          </div>
        )}

        {picked && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-neutral-500">Month</span>
                <select className={inputCls} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">Year</span>
                <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className="text-xs text-neutral-500">Priority</span>
              <PriorityPicker value={priority} onChange={setPriority} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={seenBefore} onChange={(e) => setSeenBefore(e.target.checked)} className="h-4 w-4" />
              I&apos;ve seen it before
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={invitePartner} onChange={(e) => setInvitePartner(e.target.checked)} className="h-4 w-4" />
              Invite {partnerName}?
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
          <select className={inputCls} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
            <option value={0}>Any score</option>
            {[5, 6, 7, 8, 9].map((s) => <option key={s} value={s}>{s}+ score</option>)}
          </select>
        </div>
      )}

      {items === null ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing on the list yet. Add something above!</p>
      ) : (
        <>
          <Section
            heading="To rewatch"
            items={rewatchItems}
            sort={rewatchSort}
            setSort={setRewatchSort}
            emptyText="Nothing to rewatch matches those filters."
            busy={busy}
            onToggleWatched={toggleWatched}
            onRemove={remove}
          />
          <Section
            heading="To watch"
            items={watchItems}
            sort={watchSort}
            setSort={setWatchSort}
            emptyText="Nothing new to watch matches those filters."
            busy={busy}
            onToggleWatched={toggleWatched}
            onRemove={remove}
          />
        </>
      )}
    </div>
  );
}
