/**
 * Widget API — read-only, compact endpoints for the iOS home-screen and
 * lock-screen widgets.
 *
 * Auth: the widget runs as native code with no cookie, so it sends the session
 * token as `Authorization: Bearer <token>` (see the onRequest hook in index.js).
 * The app mints that token once via POST /api/widget/token and stashes it in
 * the shared keychain for the widget to read.
 *
 *   POST /api/widget/token      → { token }           (cookie-authed; app only)
 *   GET  /api/widget/calendar   → month event days + next event
 *   GET  /api/widget/dirdle     → partner's Dirdle status for today
 *
 * All payloads are intentionally tiny — a widget timeline refresh should move
 * as few bytes as possible.
 */
import { createWidgetSession } from '../auth/auth.repo.js';
import { listUpcoming } from '../calendar/calendar.repo.js';
import { findOtherUser } from '../chat/chat.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { query } from '../../db.js';

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const LONDON = 'Europe/London';

// Two-pass Wordle scoring — mirrors the game so the widget grid matches the app
// exactly. Returns 'correct' | 'present' | 'absent' per cell (colours, never
// letters — the target word never leaves via this endpoint).
function evaluateGuess(guess, target) {
  const result = Array(WORD_LENGTH).fill('absent');
  const t = target.split('');
  const g = guess.split('');
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === t[i]) { result[i] = 'correct'; t[i] = null; g[i] = null; }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] !== null) {
      const idx = t.indexOf(g[i]);
      if (idx !== -1) { result[i] = 'present'; t[idx] = null; }
    }
  }
  return result;
}

// Today's date as YYYY-MM-DD in London local time (matches how the app + the
// dirty-wordle schedule bucket a "day").
function londonToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function nextEventShape(ev) {
  if (!ev) return null;
  const snacks = Array.isArray(ev.snack_list) ? ev.snack_list.length : 0;
  return {
    id: ev.id,
    title: ev.title,
    starts_at: ev.starts_at,
    ends_at: ev.ends_at,
    all_day: ev.all_day,
    location: ev.location ?? null,
    icon: ev.icon ?? null,
    gifts: !!ev.gifts,
    show_and_tell: !!ev.show_and_tell,
    snack_count: snacks,
  };
}

export default async function widgetRoutes(fastify) {
  /* Mint a long-lived widget token for the logged-in account. Cookie-authed
     (the app calls this), NOT bearer — you can't bootstrap a token with a
     token. The app hands the result to the native keychain. */
  fastify.post('/api/widget/token', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'not authenticated' });
    const token = await createWidgetSession(req.user.actualAccountId);
    return { token };
  });

  /* Current-month event days (for circling) + the next upcoming event with its
     metadata. Shared calendar, so no owner filter — both people's events. */
  fastify.get('/api/widget/calendar', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'not authenticated' });

    // Distinct days-of-month (London tz) that have an event starting in them.
    const { rows: dayRows } = await query(
      `SELECT DISTINCT EXTRACT(DAY FROM (starts_at AT TIME ZONE $1))::int AS day
         FROM calendar_events
        WHERE (starts_at AT TIME ZONE $1) >= date_trunc('month', (NOW() AT TIME ZONE $1))
          AND (starts_at AT TIME ZONE $1) <  date_trunc('month', (NOW() AT TIME ZONE $1)) + INTERVAL '1 month'
        ORDER BY day ASC`,
      [LONDON],
    );

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON, year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(now).reduce((a, p) => (a[p.type] = p.value, a), {});

    const [next] = await listUpcoming(1);

    return {
      year: Number(parts.year),
      month: Number(parts.month),          // 1–12
      today: Number(parts.day),            // day-of-month
      event_days: dayRows.map((r) => r.day),
      next: nextEventShape(next),
      generated_at: now.toISOString(),
    };
  });

  /* The PARTNER's Dirdle status for today, so each person sees how the other is
     doing at a glance. Three states: not_played | in_progress | completed.
     Grids are colour patterns only (no letters). */
  fastify.get('/api/widget/dirdle', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'not authenticated' });

    const me = getEffectiveAccountId(req);
    const other = await findOtherUser(me);
    const date = londonToday();
    const base = { name: other?.name ?? null, date, max: MAX_GUESSES };
    if (!other) return { ...base, status: 'not_played' };

    // Completed result wins — permanent record.
    const { rows: resultRows } = await query(
      `SELECT won, guesses_taken, guess_grid
         FROM dirty_wordle_results
        WHERE account_id = $1 AND date = $2`,
      [other.id, date],
    );
    if (resultRows[0]) {
      const r = resultRows[0];
      return {
        ...base,
        status: 'completed',
        won: r.won,
        attempts: r.guesses_taken,
        grid: Array.isArray(r.guess_grid) ? r.guess_grid : [],
      };
    }

    // In-progress — colour their partial guesses against today's word.
    const { rows: wordRows } = await query(
      `SELECT word FROM dirty_wordle_schedule WHERE date = $1`,
      [date],
    );
    const todayWord = wordRows[0]?.word ?? null;
    if (todayWord) {
      const { rows: progRows } = await query(
        `SELECT guesses FROM dirty_wordle_progress
          WHERE account_id::text = $1::text AND date = $2`,
        [other.id, date],
      );
      const guesses = Array.isArray(progRows[0]?.guesses) ? progRows[0].guesses : [];
      if (guesses.length > 0) {
        return {
          ...base,
          status: 'in_progress',
          won: false,
          attempts: guesses.length,
          grid: guesses.map((g) => evaluateGuess(String(g).toUpperCase(), todayWord)),
        };
      }
    }

    return { ...base, status: 'not_played' };
  });
}
