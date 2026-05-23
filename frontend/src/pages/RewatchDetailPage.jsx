import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW = new Date();
const YEARS = [NOW.getFullYear(), NOW.getFullYear() + 1, NOW.getFullYear() + 2];

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm focus:border-amber-500 focus:outline-none';

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

export default function RewatchDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null); // { item, tmdb }
  const [partnerName, setPartnerName] = useState('them');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  /* editable fields */
  const [priority, setPriority] = useState(3);
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [seenBefore, setSeenBefore] = useState(true);
  const [invitePartner, setInvitePartner] = useState(false);
  const [watched, setWatched] = useState(false);

  /* season episode lazy-load */
  const [openSeason, setOpenSeason] = useState(null);
  const [episodes, setEpisodes] = useState({}); // { [seasonNumber]: episodes[] }
  const [loadingSeason, setLoadingSeason] = useState(null);

  useEffect(() => {
    api.rewatchGet(id)
      .then((d) => {
        setData(d);
        const it = d.item;
        setPriority(it.priority);
        setMonth(it.watch_month || NOW.getMonth() + 1);
        setYear(it.watch_year || NOW.getFullYear());
        setSeenBefore(it.seen_before);
        setInvitePartner(it.invite_partner);
        setWatched(it.watched);
      })
      .catch((e) => setError(e.message));
    api.rewatchPartner().then((p) => p?.name && setPartnerName(p.name)).catch(() => {});
  }, [id]);

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.updateRewatch(id, {
        priority,
        watch_month: month,
        watch_year: year,
        seen_before: seenBefore,
        invite_partner: invitePartner,
        watched,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function toggleSeason(n) {
    if (openSeason === n) { setOpenSeason(null); return; }
    setOpenSeason(n);
    if (!episodes[n]) {
      setLoadingSeason(n);
      try {
        const res = await api.rewatchSeason(id, n);
        setEpisodes((prev) => ({ ...prev, [n]: res.episodes || [] }));
      } catch { /* leave empty */ }
      finally { setLoadingSeason(null); }
    }
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/rewatch" className="text-sm text-neutral-500">Back to watch list</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!data) return <p className="py-6 text-sm text-neutral-500">Loading...</p>;

  const { item, tmdb } = data;

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/rewatch" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="truncate px-2 text-lg font-semibold tracking-tight">{item.title}</h1>
        <span className="w-10" />
      </div>

      {/* Poster + meta */}
      <div className="flex gap-3">
        <div className="h-44 w-28 shrink-0 overflow-hidden rounded-xl bg-neutral-900">
          {item.poster_url ? (
            <img src={item.poster_url} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-600 text-xs">No poster</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="font-semibold">{item.title}</p>
          <p className="text-neutral-500">
            {item.media_type === 'tv' ? 'TV series' : item.media_type === 'movie' ? 'Film' : 'Title'}
            {tmdb?.runtime ? ` · ${tmdb.runtime} min` : ''}
            {item.tmdb_score ? ` · ${Number(item.tmdb_score).toFixed(1)}` : ''}
          </p>
          {item.genres?.length > 0 && <p className="text-neutral-400">{item.genres.join(', ')}</p>}
        </div>
      </div>

      {/* Editable controls */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Watch plan</h2>
          {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
        </div>
        <div>
          <span className="text-xs text-neutral-500">Priority</span>
          <PriorityPicker value={priority} onChange={setPriority} />
        </div>
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={seenBefore} onChange={(e) => setSeenBefore(e.target.checked)} className="h-4 w-4" />
          I&apos;ve seen it before (To rewatch)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={invitePartner} onChange={(e) => setInvitePartner(e.target.checked)} className="h-4 w-4" />
          Invite {partnerName}?
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={watched} onChange={(e) => setWatched(e.target.checked)} className="h-4 w-4" />
          Watched
        </label>
        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-xl bg-teal-300 py-2.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40"
        >
          Save changes
        </button>
      </section>

      {/* Overview */}
      {tmdb?.overview && (
        <section className="space-y-1">
          <h2 className="text-base font-semibold">Description</h2>
          <p className="text-sm leading-relaxed text-neutral-700">{tmdb.overview}</p>
        </section>
      )}

      {/* Cast */}
      {tmdb?.cast?.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Cast</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {tmdb.cast.map((c, i) => (
              <div key={i} className="w-20 shrink-0 text-center">
                <div className="h-28 w-20 overflow-hidden rounded-lg bg-neutral-200">
                  {c.profile_url ? (
                    <img src={c.profile_url} alt={c.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-400">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="mt-1 truncate text-[11px] font-medium" title={c.name}>{c.name}</p>
                {c.character && <p className="truncate text-[10px] text-neutral-400" title={c.character}>{c.character}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Episode guide (TV) */}
      {tmdb?.seasons?.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Episode guide</h2>
          <div className="space-y-2">
            {tmdb.seasons.map((s) => (
              <div key={s.season_number} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <button
                  onClick={() => toggleSeason(s.season_number)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                >
                  <span className="text-sm font-medium">
                    {s.name || `Season ${s.season_number}`}
                    <span className="ml-2 text-xs text-neutral-400">{s.episode_count} eps</span>
                  </span>
                  <span className="text-neutral-400">{openSeason === s.season_number ? '−' : '+'}</span>
                </button>
                {openSeason === s.season_number && (
                  <div className="border-t border-neutral-100 px-3 py-2">
                    {loadingSeason === s.season_number ? (
                      <p className="py-2 text-xs text-neutral-400">Loading episodes...</p>
                    ) : (episodes[s.season_number] || []).length === 0 ? (
                      <p className="py-2 text-xs text-neutral-400">No episode data.</p>
                    ) : (
                      <ul className="space-y-2">
                        {episodes[s.season_number].map((e) => (
                          <li key={e.episode_number} className="text-sm">
                            <p className="font-medium">
                              <span className="text-neutral-400">{e.episode_number}.</span> {e.name}
                            </p>
                            {e.overview && <p className="text-xs text-neutral-500">{e.overview}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!tmdb && (
        <p className="text-sm text-neutral-400">No extra details — this title was added as free text without a database match.</p>
      )}
    </div>
  );
}
