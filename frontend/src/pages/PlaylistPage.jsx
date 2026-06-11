/**
 * Games play list — exact replica of the Rewatch watch list, IGDB-backed.
 * Covers + platforms + ratings, partner invites, To replay / To play sections.
 */

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

/* ---- Cover placeholder for free-text entries with no artwork ---- */
function CoverFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-900 text-neutral-500">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="6" y1="11" x2="10" y2="11" />
        <line x1="8" y1="9" x2="8" y2="13" />
        <line x1="15" y1="12" x2="15.01" y2="12" />
        <line x1="18" y1="10" x2="18.01" y2="10" />
        <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258a4 4 0 0 0-3.995-3.742" />
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

/* ---- One cover card ---- */
function ItemCard({ it, busy, onTogglePlayed, onRemove }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-neutral-200 bg-white ${it.played ? 'opacity-60' : ''}`}>
      <Link to={`/playlist/${it.id}`} className="block">
        <div className="relative aspect-[3/4] bg-neutral-900">
          {it.cover_url ? (
            <img src={it.cover_url} alt={it.title} className="h-full w-full object-cover" />
          ) : (
            <CoverFallback />
          )}
          <span className="absolute left-1.5 top-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
            P{it.priority}
          </span>
          {it.invite_partner && (
            <span className="absolute right-1.5 top-1.5 rounded bg-teal-300 px-1.5 py-0.5 text-[10px] font-bold text-teal-900">
              Invite
            </span>
          )}
          {it.played && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
              Played
            </span>
          )}
        </div>
      </Link>
      <div className="space-y-1 p-2">
        <Link to={`/playlist/${it.id}`} className="block">
          <p className="truncate text-sm font-medium" title={it.title}>{it.title}</p>
        </Link>
        <p className="text-[11px] text-neutral-500">
          {it.play_month ? `${MONTHS[it.play_month - 1]} ` : ''}{it.play_year || ''}
          {it.igdb_score ? ` · ${Number(it.igdb_score).toFixed(1)}` : ''}
        </p>
        {it.platforms?.length > 0 && (
          <p className="truncate text-[11px] text-neutral-400">{it.platforms.join(', ')}</p>
        )}
        <div className="flex gap-1 pt-1">
          <button
            onClick={() => onTogglePlayed(it)}
            disabled={busy}
            className="flex-1 rounded-md bg-neutral-100 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-40"
          >
            {it.played ? 'To play' : 'Played'}
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

/* ---- A list section (To replay / To play) with its own sort ---- */
function Section({ heading, items, sort, setSort, emptyText, busy, onTogglePlayed, onRemove }) {
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-9 gap-3">
          {sorted.map((it) => (
            <ItemCard key={it.id} it={it} busy={busy} onTogglePlayed={onTogglePlayed} onRemove={onRemove} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function PlaylistPage() {
  const { account } = useBasket();
  const title = `${possessive(account?.name)} play list`;

  const [partnerName, setPartnerName] = useState('them');
  const [items, setItems] = useState(null);
  const [invites, setInvites] = useState([]);
  const [respondTo, setRespondTo] = useState(null); // invite being responded to
  const [respondPlayed, setRespondPlayed] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  /* ---- add form state ---- */
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [igdbConfigured, setIgdbConfigured] = useState(true);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [priority, setPriority] = useState(3);
  const [playedBefore, setPlayedBefore] = useState(true);
  const [invitePartner, setInvitePartner] = useState(false);
  const searchTimer = useRef(null);

  /* ---- filter + sort state ---- */
  const [platformFilter, setPlatformFilter] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [replaySort, setReplaySort] = useState('priority');
  const [playSort, setPlaySort] = useState('priority');

  async function load() {
    try { setItems(await api.playlistList()); }
    catch (e) { setError(e.message); }
  }
  async function loadInvites() {
    try { setInvites(await api.playlistInvites()); }
    catch { /* non-fatal */ }
  }
  useEffect(() => {
    load();
    loadInvites();
    api.playlistPartner().then((p) => p?.name && setPartnerName(p.name)).catch(() => {});
  }, []);

  async function acceptInvite() {
    if (!respondTo) return;
    setBusy(true); setError(null);
    try {
      await api.acceptPlaylistInvite(respondTo.id, respondPlayed);
      setRespondTo(null);
      await load();
      await loadInvites();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function declineInvite() {
    if (!respondTo) return;
    setBusy(true); setError(null);
    try {
      await api.declinePlaylistInvite(respondTo.id);
      setRespondTo(null);
      await loadInvites();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  /* ---- debounced IGDB search ---- */
  useEffect(() => {
    if (picked) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchText.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.playlistSearch(q);
        setIgdbConfigured(res.configured !== false);
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
    setPlayedBefore(true);
    setInvitePartner(false);
  }

  async function addItem() {
    if (!picked) return;
    setBusy(true); setError(null);
    try {
      await api.addPlaylist({
        igdb_id: picked.igdb_id ?? null,
        title: picked.title,
        cover_url: picked.cover_url ?? null,
        genres: picked.genres ?? [],
        platforms: picked.platforms ?? [],
        igdb_score: picked.igdb_score ?? null,
        play_month: month,
        play_year: year,
        priority,
        played_before: playedBefore,
        invite_partner: invitePartner,
      });
      resetForm();
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function togglePlayed(item) {
    setBusy(true);
    try { await api.updatePlaylist(item.id, { played: !item.played }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(item) {
    if (!confirm(`Remove "${item.title}" from the list?`)) return;
    setBusy(true);
    try { await api.deletePlaylist(item.id); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const allPlatforms = useMemo(() => {
    const s = new Set();
    (items || []).forEach((it) => (it.platforms || []).forEach((p) => s.add(p)));
    return [...s].sort();
  }, [items]);

  const filtered = useMemo(() => {
    return (items || []).filter((it) => {
      if (platformFilter && !(it.platforms || []).includes(platformFilter)) return false;
      if (minScore > 0 && (it.igdb_score == null || Number(it.igdb_score) < minScore)) return false;
      return true;
    });
  }, [items, platformFilter, minScore]);

  const replayItems = useMemo(() => filtered.filter((it) => it.played_before), [filtered]);
  const playItems = useMemo(() => filtered.filter((it) => !it.played_before), [filtered]);

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/account" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <span className="w-10" />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* ---- Pending invites ---- */}
      {invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Invites <span className="text-sm font-normal text-neutral-400">({invites.length})</span></h2>
          <div className="space-y-2">
            {invites.map((inv) => (
              <button
                key={inv.id}
                onClick={() => { setRespondTo(inv); setRespondPlayed(true); }}
                className="flex w-full items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-2 text-left transition hover:shadow-sm"
              >
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-neutral-100">
                  {inv.cover_url ? <img src={inv.cover_url} alt="" className="h-full w-full object-cover" /> : <CoverFallback />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-teal-900">{inv.title}</p>
                  <p className="text-xs text-teal-700">{inv.from_name} wants to play this with you</p>
                </div>
                <span className="shrink-0 rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-semibold text-teal-900">Respond</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---- Add form ---- */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a game</h2>

        {!picked ? (
          <div className="relative">
            <input
              className={inputCls}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Start typing a game..."
            />
            {(searchResults.length > 0 || (searchText.trim().length >= 2 && !searching)) && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
                {searchResults.map((r) => (
                  <button
                    key={r.igdb_id}
                    onClick={() => pickResult(r)}
                    className="flex w-full items-center gap-3 border-b border-neutral-100 p-2 text-left last:border-0 hover:bg-neutral-50"
                  >
                    <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-neutral-100">
                      {r.cover_url ? <img src={r.cover_url} alt="" className="h-full w-full object-cover" /> : <CoverFallback />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-neutral-500">
                        {r.year || 'Game'}
                        {r.igdb_score ? ` · ${r.igdb_score.toFixed(1)}` : ''}
                      </p>
                      {r.platforms?.length > 0 && (
                        <p className="truncate text-[11px] text-neutral-400">{r.platforms.join(', ')}</p>
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
            {!igdbConfigured && (
              <p className="mt-1 text-xs text-neutral-400">Game search is offline — you can still add games by typing them.</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-neutral-50 p-2">
            <div className="h-20 w-15 shrink-0 overflow-hidden rounded bg-neutral-100" style={{ width: 60 }}>
              {picked.cover_url ? <img src={picked.cover_url} alt="" className="h-full w-full object-cover" /> : <CoverFallback />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{picked.title}</p>
              {picked.platforms?.length > 0 && <p className="truncate text-xs text-neutral-500">{picked.platforms.join(', ')}</p>}
              {picked.igdb_score ? <p className="text-xs text-neutral-500">Score {picked.igdb_score.toFixed(1)}</p> : null}
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
              <input type="checkbox" checked={playedBefore} onChange={(e) => setPlayedBefore(e.target.checked)} className="h-4 w-4" />
              I&apos;ve played it before
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
          <select className={inputCls} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="">All platforms</option>
            {allPlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
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
            heading="To replay"
            items={replayItems}
            sort={replaySort}
            setSort={setReplaySort}
            emptyText="Nothing to replay matches those filters."
            busy={busy}
            onTogglePlayed={togglePlayed}
            onRemove={remove}
          />
          <Section
            heading="To play"
            items={playItems}
            sort={playSort}
            setSort={setPlaySort}
            emptyText="Nothing new to play matches those filters."
            busy={busy}
            onTogglePlayed={togglePlayed}
            onRemove={remove}
          />
        </>
      )}

      {respondTo && (
        <InviteRespondModal
          invite={respondTo}
          played={respondPlayed}
          setPlayed={setRespondPlayed}
          busy={busy}
          onAccept={acceptInvite}
          onDecline={declineInvite}
          onClose={() => setRespondTo(null)}
        />
      )}
    </div>
  );
}

function InviteRespondModal({ invite, played, setPlayed, busy, onAccept, onDecline, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {invite.from_name} invited you
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-24 w-18 shrink-0 overflow-hidden rounded bg-neutral-100" style={{ width: 72 }}>
            {invite.cover_url ? <img src={invite.cover_url} alt="" className="h-full w-full object-cover" /> : <CoverFallback />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{invite.title}</p>
            <p className="text-xs text-neutral-500">Priority {invite.priority}</p>
            {invite.platforms?.length > 0 && <p className="truncate text-xs text-neutral-400">{invite.platforms.join(', ')}</p>}
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={played} onChange={(e) => setPlayed(e.target.checked)} className="h-4 w-4" />
          I&apos;ve played it before
        </label>
        <p className="mt-1 text-xs text-neutral-400">
          {played ? 'It will be added to your "To replay" section.' : 'It will be added to your "To play" section.'}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onDecline}
            disabled={busy}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-40"
          >
            Decline
          </button>
          <button
            onClick={onAccept}
            disabled={busy}
            className="flex-1 rounded-xl bg-teal-300 py-2.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
