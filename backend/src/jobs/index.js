/**
 * Background jobs — anything that runs on a timer or once at boot, kept out
 * of index.js so the app entrypoint stays focused on wiring up routes.
 *
 * Jobs registered here:
 *  - One-shot media backfills (story thumbnails, legacy hero/product images)
 *  - Scheduled push notification poller (every 60s)
 *  - Expired session cleanup (hourly) — `sessions` gets a new row on every
 *    login and was previously only pruned on explicit logout, so the table
 *    grew without bound the longer the app was used.
 *
 * Anything that "builds up over time" (tables that only grow, caches that
 * only fill, files that are never cleaned up) belongs here so it's easy to
 * find in one place rather than scattered through index.js.
 */
import { query } from '../db.js';
import { sendPush } from '../modules/notifications/push.js';
import { backfillEventSnackSync } from '../modules/shopping/shopping.routes.js';

const PUSH_POLL_MS = 60_000;
const SESSION_CLEANUP_MS = 60 * 60_000; // hourly
const WORDLE_REMINDER_MS = 10 * 60_000; // check every 10 min (gated to >= 7pm)

export function registerBackgroundJobs(fastify) {
  registerOneShotBackfills(fastify);
  registerScheduledPushPoller(fastify);
  registerSessionCleanup(fastify);
  registerWordleReminder(fastify);
}

// One-shot backfills for legacy media that predates the optimized
// upload/thumbnail pipelines, plus other startup data-sync jobs. Don't
// block startup; log progress through fastify.log.
function registerOneShotBackfills(fastify) {
  // Sync snack lists of pre-existing upcoming events to shopping trips.
  backfillEventSnackSync()
    .then((n) => fastify.log.info(`event snack backfill: ${n} event(s) checked`))
    .catch((e) => fastify.log.warn({ err: e }, 'event snack backfill failed'));

  import('../modules/stories/backfill_thumbnails.js')
    .then(({ backfillVideoThumbnails, backfillImageThumbnails }) => {
      backfillVideoThumbnails(fastify.log);
      backfillImageThumbnails(fastify.log);
    })
    .catch((e) => fastify.log.error({ err: e }, 'thumbnail backfill bootstrap failed'));

  // Re-encode legacy hero-slide/product images (multi-MB PNG/JPEG,
  // predating the optimizeImage pipeline) to capped 1600px WebP. These are
  // re-fetched on every home/games page load, so this is a major win for
  // repeat-visit speed.
  import('../modules/media/backfill_images.js')
    .then(({ backfillLegacyImages }) => backfillLegacyImages(fastify.log))
    .catch((e) => fastify.log.error({ err: e }, 'legacy image backfill bootstrap failed'));
}

function registerScheduledPushPoller(fastify) {
  async function fireScheduledPushes() {
    try {
      const { rows: due } = await query(
        `UPDATE scheduled_push_notifications
            SET sent_at = NOW()
          WHERE sent_at IS NULL AND scheduled_for <= NOW()
          RETURNING id, title, body, url, account_id`,
      );
      for (const n of due) {
        // sendPush fans out to both web-push and APNs, so union recipients
        // from both device tables.
        const { rows: subs } = n.account_id
          ? await query(`SELECT $1::uuid AS account_id`, [n.account_id])
          : await query(
              `SELECT account_id FROM push_subscriptions
               UNION
               SELECT account_id FROM apns_tokens`,
            );
        await Promise.all(subs.map((r) => sendPush(r.account_id, { title: n.title, body: n.body, url: n.url })));
        fastify.log.info({ id: n.id }, 'Scheduled push fired');
      }
    } catch (e) {
      fastify.log.error({ err: e }, 'Scheduled push poller error');
    }
  }
  setInterval(fireScheduledPushes, PUSH_POLL_MS);
}

// Sessions are created on every login and were only ever deleted by an
// explicit logout. Prune rows past their expiry hourly, plus once at boot to
// clear any backlog.
//
// Every request also did (until now, see auth.repo.js findSession) an
// UPDATE ... SET last_used_at = NOW() on its session row — and /api/bootstrap
// fans that out to 6 UPDATEs per page load. Constant single-row UPDATEs leave
// dead tuples behind that autovacuum doesn't always keep up with, bloating
// the table and its indexes (including idx_sessions_token, on the hot path
// for every request) so lookups get slower the more the site is used. Run a
// VACUUM ANALYZE here too, hourly + once at boot, to keep that in check and
// clear out any bloat already accumulated.
function registerSessionCleanup(fastify) {
  async function cleanupExpiredSessions() {
    try {
      const { rowCount } = await query(`DELETE FROM sessions WHERE expires_at < NOW()`);
      if (rowCount > 0) fastify.log.info({ count: rowCount }, 'Pruned expired sessions');
      await query(`VACUUM (ANALYZE) sessions`);
    } catch (e) {
      fastify.log.error({ err: e }, 'Session cleanup error');
    }
  }
  cleanupExpiredSessions();
  setInterval(cleanupExpiredSessions, SESSION_CLEANUP_MS);
}

// After 7pm (Europe/London), nudge anyone who hasn't played today's Dirdle.
// The reminder is an ordinary notification (so it feeds the unread bubble) plus
// a push. Idempotent: a 12h window stops repeat fires the same evening while
// still allowing the next day's reminder.
function registerWordleReminder(fastify) {
  async function check() {
    try {
      const london = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
      if (london.getHours() < 19) return; // only after 7pm London
      const dateStr = `${london.getFullYear()}-${String(london.getMonth() + 1).padStart(2, '0')}-${String(london.getDate()).padStart(2, '0')}`;

      const { rows } = await query(
        `SELECT a.id FROM accounts a
          WHERE NOT EXISTS (
                  SELECT 1 FROM dirty_wordle_results r
                   WHERE r.account_id = a.id AND r.date = $1)
            AND NOT EXISTS (
                  SELECT 1 FROM notifications n
                   WHERE n.account_id = a.id AND n.type = 'wordle_reminder'
                     AND n.created_at > NOW() - INTERVAL '12 hours')`,
        [dateStr],
      );
      for (const { id } of rows) {
        await query(
          `INSERT INTO notifications (account_id, type, title, body, link_url)
           VALUES ($1, 'wordle_reminder', $2, $3, '/games/dirty-wordle')`,
          [id, 'Dirdle awaits', "You haven't played today's Dirdle yet — get on it before midnight!"],
        );
        sendPush(id, { title: 'Dirdle awaits', body: "You haven't played today's Dirdle yet!", url: '/games/dirty-wordle' });
      }
      if (rows.length) fastify.log.info({ count: rows.length }, 'Wordle reminders sent');
    } catch (e) {
      fastify.log.error({ err: e }, 'Wordle reminder error');
    }
  }
  setInterval(check, WORDLE_REMINDER_MS);
}
