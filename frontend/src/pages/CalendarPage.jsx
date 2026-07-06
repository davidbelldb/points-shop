import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import StoryViewer from '../components/stories/StoryViewer.jsx';
import FeaturedStory from '../components/stories/FeaturedStory.jsx';
import { EVENT_ICONS, EventIcon, EVENT_ICON_COLOR } from '../lib/eventIcons.jsx';
import { useBodyScrollLock } from '../lib/useBodyScrollLock.js';

/* ============================================================
   SnackInput — snack field with grocery-catalogue lookup.
   Suggests house groceries (with photos) as you type.
   ============================================================ */
function SnackInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const term = value.trim();
    if (term.length < 2) { setMatches([]); return; }
    const t = setTimeout(() => {
      api.shopGroceries(term)
        .then(({ groceries }) => setMatches(groceries))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  const showDropdown = open && value.trim().length >= 2 && matches.length > 0 &&
    !(matches.length === 1 && matches[0].name === value);

  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Sweet Chilli Sensations"
        className="block w-full rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
      />
      {showDropdown && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {matches.map((g) => (
            <button
              type="button"
              key={g.id}
              onMouseDown={(e) => e.preventDefault() /* keep input focus until click lands */}
              onClick={() => { onChange(g.name); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100"
            >
              {g.image_url
                ? <img src={g.image_url} alt="" className="h-8 w-8 shrink-0 rounded bg-white object-contain" />
                : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-100 text-sm">🛒</span>}
              <span className="truncate text-sm text-neutral-900">{g.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Date helpers — small, dependency-free, all local-TZ aware.
   ============================================================ */
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad2 = (n) => String(n).padStart(2, '0');

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonthExclusive(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dayKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// Build the 6-week (42-cell) grid for the month containing `focus`, starting Monday.
function buildMonthGrid(focus) {
  const first = startOfMonth(focus);
  const dow = first.getDay(); // 0 = Sunday
  const offset = dow === 0 ? 6 : dow - 1;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// Event covers a calendar day if startOfDay(day) is between startOfDay(starts) and startOfDay(ends).
function eventCoversDay(ev, day) {
  const s = startOfDay(new Date(ev.starts_at));
  const e = startOfDay(new Date(ev.ends_at || ev.starts_at));
  const d = startOfDay(day);
  return d >= s && d <= e;
}

function isoToLocalDatetimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function isoToLocalDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function datetimeInputToIso(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}
function dateInputToIso(value, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? 'T23:59' : 'T00:00';
  return new Date(`${value}${suffix}`).toISOString();
}

function formatEventDateLine(ev) {
  const s = new Date(ev.starts_at);
  const e = ev.ends_at ? new Date(ev.ends_at) : null;
  const dateStr = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (ev.all_day) {
    if (e && !sameDay(s, e)) return `${dateStr(s)} – ${dateStr(e)} • All day`;
    return `${dateStr(s)} • All day`;
  }
  if (e && !sameDay(s, e)) {
    return `${dateStr(s)} ${timeStr(s)} – ${dateStr(e)} ${timeStr(e)}`;
  }
  if (e) return `${dateStr(s)} • ${timeStr(s)} – ${timeStr(e)}`;
  return `${dateStr(s)} • ${timeStr(s)}`;
}

/* ============================================================
   The page itself.
   ============================================================ */
export default function CalendarPage() {
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null); // Date | null (null = whole month)
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | event obj

  const [monthStories, setMonthStories] = useState(null); // archived stories for the focused month
  const [partnerName, setPartnerName] = useState(null); // the other account — for the "Invite" box

  const grid = useMemo(() => buildMonthGrid(focusDate), [focusDate]);

  // The other person's name, so the editor can label the "Invite {name}" box.
  useEffect(() => {
    let cancelled = false;
    api.getCalendarPartner()
      .then((p) => { if (!cancelled) setPartnerName(p?.name ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Archived stories for the whole focused month — feeds both the Featured
  // story panel and the Sneaky Highlights grid below, so we only query once.
  useEffect(() => {
    const from = startOfMonth(focusDate).toISOString();
    const to   = endOfMonthExclusive(focusDate).toISOString();
    let cancelled = false;
    setMonthStories(null);
    api.listArchiveStories(from, to)
      .then((data) => { if (!cancelled) setMonthStories(data); })
      .catch(() => { if (!cancelled) setMonthStories([]); });
    return () => { cancelled = true; };
  }, [focusDate]);

  // Fetch a generous window covering the visible grid (might span the prev/next month).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const from = grid[0].toISOString();
        const to = addDays(grid[grid.length - 1], 1).toISOString();
        const data = await api.listCalendarEvents(from, to);
        if (!cancelled) setEvents(data);
      } catch (e) { if (!cancelled) setError(e.message); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [grid]);

  // Map day-key → array of events covering that day (for the dot pips).
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const s = startOfDay(new Date(ev.starts_at));
      const e = startOfDay(new Date(ev.ends_at || ev.starts_at));
      for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
        const k = dayKey(d);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(ev);
      }
    }
    return map;
  }, [events]);

  // Events in the list section: filtered by selected day, or all events that
  // start in the focused month (sorted chronologically) when no day is picked.
  const listEvents = useMemo(() => {
    if (selectedDay) {
      return events.filter((ev) => eventCoversDay(ev, selectedDay))
                   .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    }
    const monthStart = startOfMonth(focusDate);
    const monthEnd   = endOfMonthExclusive(focusDate);
    return events
      .filter((ev) => {
        const s = new Date(ev.starts_at);
        return s >= monthStart && s < monthEnd;
      })
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }, [events, selectedDay, focusDate]);

  function gotoToday() {
    const today = new Date();
    setFocusDate(today);
    setSelectedDay(startOfDay(today));
  }
  function changeMonth(delta) {
    setSelectedDay(null);
    setFocusDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  async function refresh() {
    try {
      const from = grid[0].toISOString();
      const to = addDays(grid[grid.length - 1], 1).toISOString();
      const data = await api.listCalendarEvents(from, to);
      setEvents(data);
    } catch (e) { setError(e.message); }
  }

  async function handleSave(payload, eventId) {
    if (eventId) await api.updateCalendarEvent(eventId, payload);
    else         await api.createCalendarEvent(payload);
    setEditing(null);
    await refresh();
  }

  async function handleDelete(eventId) {
    if (!confirm('Delete this event?')) return;
    await api.deleteCalendarEvent(eventId);
    setEditing(null);
    await refresh();
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sneaky Calendar</h1>
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
      </div>

      {/* ── Responsive layout: calendar + events on md+, plus a Featured story
            square as a third column on large desktop screens. ── */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,460px)_1fr] lg:grid-cols-[minmax(0,400px)_1fr_minmax(0,400px)] md:gap-6 md:items-start">

        {/* LEFT — month grid */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-3 md:col-start-1 md:row-start-1">
          <div className="flex items-center justify-between">
            <button onClick={() => changeMonth(-1)} className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100" aria-label="Previous month">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div className="text-sm font-semibold">
              {MONTH_LABELS[focusDate.getMonth()]} {focusDate.getFullYear()}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={gotoToday} className="rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50">Today</button>
              <button onClick={() => changeMonth(1)} className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100" aria-label="Next month">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {WEEKDAY_LABELS.map((w) => <div key={w}>{w}</div>)}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((day) => {
              const inMonth   = day.getMonth() === focusDate.getMonth();
              const isToday   = sameDay(day, new Date());
              const isPicked  = selectedDay && sameDay(day, selectedDay);
              const dayEvents = eventsByDay.get(dayKey(day)) || [];
              const hasGifts  = dayEvents.some((e) => e.gifts);
              const hasShow   = dayEvents.some((e) => e.show_and_tell);
              return (
                <button
                  key={dayKey(day)}
                  onClick={() => setSelectedDay(isPicked ? null : startOfDay(day))}
                  className={[
                    'flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium transition',
                    inMonth ? 'text-neutral-800' : 'text-neutral-300',
                    isPicked ? 'bg-amber-500 text-amber-950'
                             : isToday ? 'bg-amber-100 text-amber-900'
                             : 'hover:bg-neutral-100',
                  ].join(' ')}
                >
                  <span>{day.getDate()}</span>
                  {dayEvents.length > 0 && (
                    <span className="mt-0.5 flex items-center gap-0.5">
                      {hasShow  && <span className="h-1 w-1 rounded-full bg-pink-500" />}
                      {hasGifts && <span className="h-1 w-1 rounded-full bg-emerald-500" />}
                      {!hasShow && !hasGifts && <span className="h-1 w-1 rounded-full bg-amber-600" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-center text-[11px] text-neutral-400">
            {selectedDay ? `Showing ${selectedDay.toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'long' })}` : `Showing ${MONTH_LABELS[focusDate.getMonth()]}`}
          </p>
        </section>

        {/* RIGHT — event list */}
        <section className="space-y-2 md:col-start-2 md:row-start-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading && events.length === 0 && (
            <p className="text-sm text-neutral-500">Loading sneaky events...</p>
          )}
          {!loading && listEvents.length === 0 && (
            <p className="text-sm text-neutral-500">
              {selectedDay ? 'Nothing on this day yet.' : 'Nothing in this month yet.'}
            </p>
          )}
          {listEvents.map((ev) => (
            <EventCard key={ev.id} ev={ev} onClick={() => setEditing(ev)} />
          ))}
        </section>

        {/* FEATURED — a random story from this month, shown only on large
            desktop screens as a square matching the calendar's footprint. */}
        <FeaturedStory
          stories={monthStories}
          variant="calendar"
          className="hidden lg:block lg:col-start-3 lg:row-start-1"
        />

      </div>

      {/* Story highlights — full width below the columns */}
      <HighlightsSection stories={monthStories} selectedDay={selectedDay} />

      {/* Floating create button */}
      <button
        onClick={() => setEditing('new')}
        aria-label="New event"
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-amber-950 shadow-lg transition active:scale-95 supports-[padding:env(safe-area-inset-bottom)]:bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Editor overlay */}
      {editing && (
        <EventEditor
          initial={editing === 'new' ? null : editing}
          defaultDate={selectedDay || new Date()}
          partnerName={partnerName}
          onCancel={() => setEditing(null)}
          onSave={(payload, id) => handleSave(payload, id)}
          onDelete={(id) => handleDelete(id)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Highlights — archived stories for the focused month (passed down from
   CalendarPage). If a day is selected, filters down to that day. Thumbnails
   flow edge-to-edge in one continuous wrapping grid: each day's small date
   chip is followed inline by that day's thumbnails, so e.g. Jun 2's stories
   sit right after Jun 1's rather than starting a fresh row per day.
   ============================================================ */
function HighlightsSection({ stories, selectedDay }) {
  const [viewer, setViewer] = useState(null);

  const filtered = useMemo(() => {
    if (!stories) return [];
    if (selectedDay) {
      return stories.filter((s) => sameDay(new Date(s.created_at), selectedDay));
    }
    return stories;
  }, [stories, selectedDay]);

  // Group day-by-day; preserves the archive's newest-first order.
  const dayGroups = useMemo(() => {
    const map = new Map();
    for (const s of filtered) {
      const k = dayKey(new Date(s.created_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    return Array.from(map.entries()).map(([k, arr]) => ({ k, date: new Date(arr[0].created_at), stories: arr }));
  }, [filtered]);

  if (stories === null) return null;
  if (stories.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl bg-amber-50 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800">Sneaky Highlights</h2>
        <Link to="/stories" className="text-xs font-semibold text-amber-700">All highlights</Link>
      </div>
      {dayGroups.length === 0 ? (
        <p className="text-xs text-neutral-500">No stories archived on this day.</p>
      ) : (
        <div className="flex flex-wrap items-stretch gap-1.5">
          {dayGroups.map((g) => (
            <Fragment key={g.k}>
              {/* Inline date chip — sits in the flow so the next day's
                  thumbnails pack directly after this day's. */}
              <div className="flex shrink-0 flex-col justify-center pr-0.5 pl-1">
                <span className="text-[10px] font-semibold uppercase leading-tight text-neutral-400">
                  {g.date.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span className="text-xs font-bold leading-tight text-neutral-600">
                  {g.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </div>
              {g.stories.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    const queue = g.stories.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    setViewer({ stories: queue, index: queue.findIndex((x) => x.id === s.id) });
                  }}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 sm:h-24 sm:w-24"
                >
                  {s.media_type === 'video' ? (
                    <>
                      {s.thumbnail_url ? (
                        <img src={s.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <video src={s.media_url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
                      )}
                      <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">▶</span>
                    </>
                  ) : (
                    <img src={s.thumbnail_url || s.media_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      )}
      {viewer && (
        <StoryViewer
          stories={viewer.stories}
          initialIndex={Math.max(0, viewer.index)}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}

/* ============================================================
   Event card.
   ============================================================ */
function EventCard({ ev, onClick }) {
  // Cards alternate by flag — gifts → pink, show-and-tell → teal accent, plain → teal-50.
  const pink = ev.gifts;
  const tone = pink ? 'bg-pink-50' : 'bg-amber-50';
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left transition hover:shadow-sm active:scale-[0.99] ${tone}`}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
        style={{ backgroundColor: '#fce7f3', color: EVENT_ICON_COLOR }}
      >
        <EventIcon iconKey={ev.icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold text-neutral-900">{ev.title}</p>
        <p className="line-clamp-1 text-xs text-neutral-600">{formatEventDateLine(ev)}</p>
        {ev.location && (
          <p className="line-clamp-1 text-[11px] text-neutral-500">{ev.location}</p>
        )}
      </div>
      {(ev.show_and_tell || ev.gifts) && (
        <div className="shrink-0 flex flex-col items-end gap-1 text-[10px] font-semibold">
          {ev.show_and_tell && (
            <span className="rounded-full bg-pink-200 px-2 py-0.5 text-pink-800">Show & Tell</span>
          )}
          {ev.gifts && (
            <span className="rounded-full bg-pink-200 px-2 py-0.5 text-pink-800">Gifts</span>
          )}
        </div>
      )}
    </button>
  );
}

/* ============================================================
   Event editor (create + edit + delete in one).
   ============================================================ */
function EventEditor({ initial, defaultDate, partnerName, onCancel, onSave, onDelete }) {
  // Lock the page behind this full-screen sheet so scroll gestures only move
  // the sheet's own content, not the calendar underneath.
  useBodyScrollLock();
  const isNew = !initial;

  // Default a new event to the picked day at the next hour boundary, lasting an hour.
  const seed = useMemo(() => {
    if (initial) return initial;
    const d = new Date(defaultDate);
    d.setMinutes(0, 0, 0);
    if (d <= new Date()) d.setHours(new Date().getHours() + 1);
    const end = new Date(d); end.setHours(d.getHours() + 1);
    return { starts_at: d.toISOString(), ends_at: end.toISOString() };
  }, [initial, defaultDate]);

  const [title, setTitle]           = useState(seed.title ?? '');
  const [description, setDescription] = useState(seed.description ?? '');
  const [location, setLocation]     = useState(seed.location ?? '');
  const [allDay, setAllDay]         = useState(!!seed.all_day);
  const [startsAt, setStartsAt]     = useState(seed.starts_at);
  const [endsAt, setEndsAt]         = useState(seed.ends_at);
  const [showAndTell, setShowAndTell] = useState(!!seed.show_and_tell);
  const [gifts, setGifts]           = useState(!!seed.gifts);
  const [snackList, setSnackList]   = useState(Array.isArray(seed.snack_list) ? seed.snack_list.slice() : []);
  const [icon, setIcon]             = useState(seed.icon ?? 'calendar');
  const [invite, setInvite]         = useState(true); // notify the other person (new events only)
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);
  const valid = title.trim() && startsAt;

  async function save() {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      await onSave({
        title:        title.trim(),
        description:  description.trim() || null,
        location:     location.trim() || null,
        starts_at:    startsAt,
        ends_at:      endsAt || null,
        all_day:      allDay,
        show_and_tell: showAndTell,
        gifts,
        snack_list:   snackList.map((s) => s.trim()).filter(Boolean),
        icon,
        invite:       isNew ? invite : false,
      }, initial?.id);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  function onStartChange(value) {
    const iso = allDay ? dateInputToIso(value, false) : datetimeInputToIso(value);
    setStartsAt(iso);
  }
  function onEndChange(value) {
    const iso = allDay ? dateInputToIso(value, true) : datetimeInputToIso(value);
    setEndsAt(iso);
  }
  function toggleAllDay(next) {
    setAllDay(next);
    // Snap times when switching modes.
    if (next) {
      if (startsAt) setStartsAt(dateInputToIso(isoToLocalDateInput(startsAt), false));
      if (endsAt)   setEndsAt(dateInputToIso(isoToLocalDateInput(endsAt), true));
    }
  }

  return (
    <div className="sheet-below-nav flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl sm:h-auto sm:max-h-full sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onCancel} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">{isNew ? 'New event' : 'Edit event'}</span>
          <button onClick={save} disabled={!valid || busy} className="text-sm font-semibold text-amber-700 disabled:opacity-40">
            Save
          </button>
        </header>

        <div data-modal-scroll className="sheet-safe-bottom flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y px-4 pt-4 pb-8">
          <div>
            <label className="text-xs font-semibold text-neutral-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sneaky Cinema Trip"
              className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Icon</label>
            <div className="mt-1 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {EVENT_ICONS.map(({ key, label, Icon }) => {
                const selected = icon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    aria-label={label}
                    title={label}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      selected ? 'bg-pink-100' : 'bg-neutral-100'
                    }`}
                    style={{ color: EVENT_ICON_COLOR }}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl bg-neutral-100 px-3 py-2 text-sm font-medium">
            <span>All day</span>
            <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} className="h-4 w-4" />
          </label>

          {isNew && partnerName && (
            <label className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              <span>Invite {partnerName}</span>
              <input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} className="h-4 w-4" />
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-neutral-500">Starts</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? isoToLocalDateInput(startsAt) : isoToLocalDatetimeInput(startsAt)}
                onChange={(e) => onStartChange(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-2 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500">Ends</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? isoToLocalDateInput(endsAt) : isoToLocalDatetimeInput(endsAt)}
                onChange={(e) => onEndChange(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-2 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. David's Flat"
              className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between rounded-xl bg-pink-50 px-3 py-2 text-sm font-medium text-pink-800">
              <span>Show & Tell</span>
              <input type="checkbox" checked={showAndTell} onChange={(e) => setShowAndTell(e.target.checked)} className="h-4 w-4" />
            </label>
            <label className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <span>Gifts</span>
              <input type="checkbox" checked={gifts} onChange={(e) => setGifts(e.target.checked)} className="h-4 w-4" />
            </label>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Where we goin', what we doin'?"
              className="mt-1 block w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-500">Snack list</label>
              <button
                type="button"
                onClick={() => setSnackList((list) => [...list, ''])}
                className="text-xs font-semibold text-amber-700"
              >
                + Add snack
              </button>
            </div>
            <div className="mt-1 space-y-2">
              {snackList.length === 0 && (
                <p className="text-xs text-neutral-400">No snacks yet — what are we, animals?</p>
              )}
              {snackList.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <SnackInput
                    value={s}
                    onChange={(v) => setSnackList((list) => list.map((x, i) => (i === idx ? v : x)))}
                  />
                  <button
                    type="button"
                    onClick={() => setSnackList((list) => list.filter((_, i) => i !== idx))}
                    className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                    aria-label="Remove snack"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          {!isNew && (
            <button
              type="button"
              onClick={() => onDelete(initial.id)}
              className="mt-2 w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
            >
              Delete event
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
