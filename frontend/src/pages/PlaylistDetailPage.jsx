/**
 * Game detail — replica of the Rewatch detail page on IGDB data:
 * cover + meta, editable play plan, summary, developers, screenshots.
 */

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

export default function PlaylistDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null); // { item, igdb }
  const [partnerName, setPartnerName] = useState('them');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  /* editable fields */
  const [priority, setPriority] = useState(3);
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [playedBefore, setPlayedBefore] = useState(true);
  const [invitePartner, setInvitePartner] = useState(false);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    api.playlistGet(id)
      .then((d) => {
        setData(d);
        const it = d.item;
        setPriority(it.priority);
        setMonth(it.play_month || NOW.getMonth() + 1);
        setYear(it.play_year || NOW.getFullYear());
        setPlayedBefore(it.played_before);
        setInvitePartner(it.invite_partner);
        setPlayed(it.played);
      })
      .catch((e) => setError(e.message));
    api.playlistPartner().then((p) => p?.name && setPartnerName(p.name)).catch(() => {});
  }, [id]);

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.updatePlaylist(id, {
        priority,
        play_month: month,
        play_year: year,
        played_before: playedBefore,
        invite_partner: invitePartner,
        played,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/playlist" className="text-sm text-neutral-500">Back to play list</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!data) return <p className="py-6 text-sm text-neutral-500">Loading...</p>;

  const { item, igdb } = data;

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/playlist" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="truncate px-2 text-lg font-semibold tracking-tight">{item.title}</h1>
        <span className="w-10" />
      </div>

      {/* Cover + meta */}
      <div className="flex gap-3">
        <div className="h-44 w-32 shrink-0 overflow-hidden rounded-xl bg-neutral-900">
          {item.cover_url ? (
            <img src={item.cover_url} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-600 text-xs">No cover</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="font-semibold">{item.title}</p>
          <p className="text-neutral-500">
            {igdb?.year ? `${igdb.year}` : 'Game'}
            {item.igdb_score ? ` · ${Number(item.igdb_score).toFixed(1)}` : ''}
          </p>
          {(igdb?.platforms?.length > 0 || item.platforms?.length > 0) && (
            <p className="text-neutral-400">{(igdb?.platforms?.length ? igdb.platforms : item.platforms).join(', ')}</p>
          )}
          {igdb?.developers?.length > 0 && (
            <p className="text-neutral-400">By {igdb.developers.join(', ')}</p>
          )}
          {item.genres?.length > 0 && <p className="text-neutral-400">{item.genres.join(', ')}</p>}
        </div>
      </div>

      {/* Editable controls */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Play plan</h2>
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
          <input type="checkbox" checked={playedBefore} onChange={(e) => setPlayedBefore(e.target.checked)} className="h-4 w-4" />
          I&apos;ve played it before (To replay)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={invitePartner} onChange={(e) => setInvitePartner(e.target.checked)} className="h-4 w-4" />
          Invite {partnerName}?
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={played} onChange={(e) => setPlayed(e.target.checked)} className="h-4 w-4" />
          Played
        </label>
        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-xl bg-teal-300 py-2.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40"
        >
          Save changes
        </button>
      </section>

      {/* Summary */}
      {igdb?.summary && (
        <section className="space-y-1">
          <h2 className="text-base font-semibold">Description</h2>
          <p className="text-sm leading-relaxed text-neutral-700">{igdb.summary}</p>
        </section>
      )}

      {/* Screenshots */}
      {igdb?.screenshots?.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Screenshots</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {igdb.screenshots.map((url, i) => (
              <div key={i} className="h-32 w-56 shrink-0 overflow-hidden rounded-lg bg-neutral-200">
                <img src={url} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </section>
      )}

      {!igdb && (
        <p className="text-sm text-neutral-400">No extra details — this game was added as free text without a database match.</p>
      )}
    </div>
  );
}
