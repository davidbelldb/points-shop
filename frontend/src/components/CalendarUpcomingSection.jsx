import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

/* Compact preview strip for the home page. Three thin cards, each with a
   calendar glyph on the left and title/meta on the right. Tapping any card
   takes you to /calendar (we'll wire deeper linking later when this lands
   in the menu). Hidden entirely if there are no upcoming events, so we
   don't carve dead space on the home page for a fresh account. */
function CalendarGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dateLabel(d) {
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, today))    return 'Today';
  if (sameDay(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function metaLine(ev) {
  const s = new Date(ev.starts_at);
  if (ev.all_day) return `${dateLabel(s)} • All day`;
  const t = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel(s)} • ${t}`;
}

function UpcomingCard({ ev }) {
  // Pink if it's a gifts event, teal otherwise — keeps the page palette tight.
  const pink = ev.gifts;
  const tone = pink ? 'bg-pink-50 border-pink-200' : 'bg-amber-50 border-amber-200';
  const iconTone = pink ? 'text-pink-700' : 'text-amber-700';
  return (
    <Link
      to="/calendar"
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition hover:shadow-sm active:scale-[0.99] ${tone}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 ${iconTone}`}>
        <CalendarGlyph />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold text-neutral-900">{ev.title}</p>
        <p className="line-clamp-1 text-[11px] text-neutral-600">{metaLine(ev)}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold">
          {ev.show_and_tell && (
            <span className="rounded-full bg-pink-200 px-1.5 py-0.5 text-pink-800">Show & Tell</span>
          )}
          {ev.gifts && (
            <span className="rounded-full bg-pink-200 px-1.5 py-0.5 text-pink-800">Gifts</span>
          )}
          {ev.location && !ev.show_and_tell && !ev.gifts && (
            <span className="line-clamp-1 text-neutral-500">{ev.location}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function CalendarUpcomingSection() {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.listCalendarUpcoming(3)
      .then((data) => { if (!cancelled) setEvents(data); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, []);

  if (!events || events.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Calendar</h2>
          <p className="mt-1 text-sm text-neutral-500">A sneaky preview of sneaky events</p>
        </div>
        <Link to="/calendar" className="text-xs font-semibold text-amber-700">See all</Link>
      </div>
      <div className="space-y-2">
        {events.map((ev) => <UpcomingCard key={ev.id} ev={ev} />)}
      </div>
    </section>
  );
}
