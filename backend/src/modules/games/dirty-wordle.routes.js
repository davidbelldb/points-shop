/**
 * Dirty Wordle — backend routes
 *
 * GET  /api/games/dirty-wordle/word?date=YYYY-MM-DD
 *   Returns the word assigned to that date, assigning one on first call.
 *   Words cycle through the full list in random order before any repeats.
 *
 * POST /api/games/dirty-wordle/result
 *   Body: { date, won, guesses_taken, guess_grid }
 *   Saves result + credits points on win (idempotent per account+date).
 *
 * GET /api/games/dirty-wordle/leaderboard?date=YYYY-MM-DD
 *   Returns today's grids for both players + all-time stats.
 *
 * Points: 1=44, 2=36, 3=28, 4=16, 5=8, 6=4
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { creditPoints }          from './games.repo.js';
import { query }                 from '../../db.js';

const PTS_BY_GUESS = [44, 36, 28, 16, 8, 4];
const WORD_LENGTH = 5;

/**
 * Score a guess against the target — standard two-pass Wordle scoring so
 * duplicate letters resolve correctly. Mirrors the frontend evaluateGuess so
 * in-progress grids look identical to completed ones. Returns an array of
 * 'correct' | 'present' | 'absent' (colours only — never the letters).
 */
function evaluateGuess(guess, target) {
  const result    = Array(WORD_LENGTH).fill('absent');
  const targetArr = target.split('');
  const guessArr  = guess.split('');
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] === targetArr[i]) {
      result[i] = 'correct'; targetArr[i] = null; guessArr[i] = null;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] !== null) {
      const idx = targetArr.indexOf(guessArr[i]);
      if (idx !== -1) { result[i] = 'present'; targetArr[idx] = null; }
    }
  }
  return result;
}

// Master word list — must match the frontend WORDS array
const WORDS = [
  'FILTH','SLUTS','SLAGS','WHORE','WANKY','BOOBS','TITTY','BUTTS','WILLY','BITCH',
  'STIFF','COCKS','PUSSY','CUNTS','TWATS','NECKS','PLUGS','KATIE','DAVID',
  'STUFF','CREAM','KNEES','DOGGY','BRACE','SLAPS','CHOKE',
  'HORNY','DIRTY','SPANK','LUSTY','KINKY','NAKED','BOOTY','ERECT','LOVER','COCKY',
  'BALLS','BONER','PERVY','RANDY','JUICY','NUDES','PANTY','THONG','GROAN','MOANS',
  'LICKS','TEASE','FLIRT','STRIP','NASTY','NYMPH','TABOO','SHAFT','GRIND','STRAP',
  'TOUCH','TWERK','VULVA','DICKS','PRICK','TAINT','SPUNK','SAUCY','FLESH','FANNY',
  'MOIST','GROPE','THROB','PORNO','CRUDE','SEXTS','TRYST','DADDY','THIGH','VIXEN',
  'BAWDY','STUDS','WENCH','TRAMP','SMUTS','LETCH','KNOBS','WANKS','SHAGS','BONKS',
  'HUMPS','ROMPS','LOINS','GROIN','BUSTY','BUXOM','TARTS','HUSSY','KINKS','ARSES',
  'MILFS','MUFFS','BOUND','ROUGH','DILDO','FUCKS','SUCKS','BLOWS',
];

/**
 * Returns the word for `date` (YYYY-MM-DD), assigning one if not yet set.
 *
 * Words are drawn from dirty_wordle_word_bank. Every word is used exactly
 * once before any repeats — when the bank is exhausted it resets and a new
 * cycle begins. Selection is atomic in the DB via FOR UPDATE SKIP LOCKED,
 * so concurrent requests for different dates can never claim the same word.
 */
async function getOrAssignWord(date) {
  // 1. Return early if already assigned
  const { rows: existing } = await query(
    `SELECT word FROM dirty_wordle_schedule WHERE date = $1`,
    [date],
  );
  if (existing[0]) return existing[0].word;

  // 2. Atomically claim a random available word from the bank
  async function claimWord() {
    const { rows } = await query(
      `UPDATE dirty_wordle_word_bank
       SET used_on = $1
       WHERE word = (
         SELECT word FROM dirty_wordle_word_bank
         WHERE used_on IS NULL
         ORDER BY random()
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING word`,
      [date],
    );
    return rows[0]?.word ?? null;
  }

  let word = await claimWord();

  // 3. Bank exhausted — reset for a new cycle and try once more
  if (!word) {
    await query(`UPDATE dirty_wordle_word_bank SET used_on = NULL`);
    word = await claimWord();
  }

  if (!word) throw new Error('dirty-wordle: word bank empty after reset');

  // 4. Determine cycle number and record in schedule
  const { rows: totalRows } = await query(`SELECT COUNT(*) AS n FROM dirty_wordle_schedule`);
  const cycle = Math.floor(Number(totalRows[0].n) / WORDS.length) + 1;

  await query(
    `INSERT INTO dirty_wordle_schedule (date, word, cycle)
     VALUES ($1, $2, $3)
     ON CONFLICT (date) DO NOTHING`,
    [date, word, cycle],
  );

  // 5. Re-read in case two requests raced on the same date — release our
  //    bank claim if another request's word won the schedule slot.
  const { rows: final } = await query(
    `SELECT word FROM dirty_wordle_schedule WHERE date = $1`,
    [date],
  );
  if (final[0].word !== word) {
    await query(
      `UPDATE dirty_wordle_word_bank SET used_on = NULL WHERE word = $1`,
      [word],
    );
  }

  return final[0].word;
}

export default async function dirtyWordleRoutes(fastify) {

  // ── Daily word ────────────────────────────────────────────────────────────
  fastify.get('/api/games/dirty-wordle/word', async (req, reply) => {
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date must be YYYY-MM-DD' });
    }
    const word = await getOrAssignWord(date);
    return { date, word };
  });

  // ── Save result (win or loss) + credit points on win ──────────────────────
  fastify.post('/api/games/dirty-wordle/result', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { date, won, guesses_taken, guess_grid, guesses } = req.body ?? {};

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date required (YYYY-MM-DD)' });
    }
    if (typeof won !== 'boolean') {
      return reply.code(400).send({ error: 'won (boolean) required' });
    }
    if (!Number.isInteger(guesses_taken) || guesses_taken < 1 || guesses_taken > 6) {
      return reply.code(400).send({ error: 'guesses_taken must be 1–6' });
    }
    if (!Array.isArray(guess_grid) || guess_grid.length === 0) {
      return reply.code(400).send({ error: 'guess_grid array required' });
    }

    // Upsert result row — idempotent, first write wins
    await query(
      `INSERT INTO dirty_wordle_results (account_id, date, won, guesses_taken, guess_grid, guesses)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (account_id, date) DO UPDATE SET guesses = EXCLUDED.guesses`,
      [accountId, date, won, guesses_taken, JSON.stringify(guess_grid), JSON.stringify(guesses ?? [])],
    );

    // Credit points on win (also idempotent via ledger reason)
    let pts = 0;
    let alreadyClaimed = false;
    if (won) {
      const reason = `dirty-wordle:${date}`;
      pts = PTS_BY_GUESS[guesses_taken - 1] ?? 4;
      const { rows } = await query(
        `SELECT 1 FROM points_ledger WHERE reason = $1 AND account_id = $2 LIMIT 1`,
        [reason, accountId],
      );
      if (rows.length > 0) {
        alreadyClaimed = true;
      } else {
        await creditPoints(accountId, pts, reason);
      }
    }

    return { pts, alreadyClaimed };
  });

  // ── Leaderboard ───────────────────────────────────────────────────────────
  fastify.get('/api/games/dirty-wordle/leaderboard', async (req) => {
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);

    // Today's results for all accounts
    const { rows: todayRows } = await query(
      `SELECT r.account_id, r.won, r.guesses_taken, r.guess_grid,
              a.name, a.photo_url,
              pl.delta AS pts
         FROM dirty_wordle_results r
         JOIN accounts a ON a.id = r.account_id
         LEFT JOIN points_ledger pl
           ON pl.account_id = r.account_id
          AND pl.reason = $1
        WHERE r.date = $2
        ORDER BY r.guesses_taken ASC, r.created_at ASC`,
      [`dirty-wordle:${date}`, date],
    );

    // Current-series stats — find the active series, fall back to most recent
    const { rows: seriesRows } = await query(
      `SELECT id, name, starts_on, ends_on
         FROM dirty_wordle_series
        WHERE starts_on <= CURRENT_DATE
        ORDER BY starts_on DESC
        LIMIT 1`,
    );
    const currentSeries     = seriesRows[0] ?? null;
    const seriesStartStr    = currentSeries?.starts_on?.toISOString?.().slice(0, 10)
                              ?? currentSeries?.starts_on ?? null;
    const seriesEndStr      = currentSeries?.ends_on?.toISOString?.().slice(0, 10)
                              ?? currentSeries?.ends_on ?? null;
    const currentSeriesName = currentSeries?.name ?? null;

    const { rows: statsRows } = await query(
      `SELECT a.id AS account_id,
              a.name,
              a.photo_url,
              COUNT(r.id)                                        AS games_played,
              COUNT(r.id) FILTER (WHERE r.won)                   AS wins,
              ROUND(AVG(r.guesses_taken) FILTER (WHERE r.won)::numeric, 1) AS avg_guesses,
              COALESCE(SUM(pl.delta), 0)                         AS total_pts
         FROM accounts a
         LEFT JOIN dirty_wordle_results r
           ON r.account_id = a.id
          AND ($1::date IS NULL OR r.date >= $1::date)
          AND ($2::date IS NULL OR r.date <= $2::date)
         LEFT JOIN points_ledger pl
           ON pl.account_id = a.id
          AND pl.reason = 'dirty-wordle:' || r.date::text
          AND r.won = true
        GROUP BY a.id, a.name, a.photo_url
        ORDER BY wins DESC, avg_guesses ASC NULLS LAST`,
      [seriesStartStr, seriesEndStr],
    );

    // ── Series wins ───────────────────────────────────────────────────────
    // Compute how many series each player has won (only completed series count).
    const { rows: completedSeries } = await query(
      `SELECT id, starts_on, ends_on FROM dirty_wordle_series WHERE ends_on < CURRENT_DATE ORDER BY starts_on`,
    );

    const seriesWins = {}; // account_id → win count

    for (const series of completedSeries) {
      // Sum dirty-wordle points per player within this series window
      const { rows: ptsByPlayer } = await query(
        `SELECT a.id AS account_id, COALESCE(SUM(pl.delta), 0) AS pts
           FROM accounts a
           LEFT JOIN points_ledger pl
             ON pl.account_id = a.id
            AND pl.reason LIKE 'dirty-wordle:%'
            AND TO_DATE(REPLACE(pl.reason, 'dirty-wordle:', ''), 'YYYY-MM-DD') BETWEEN $1 AND $2
          GROUP BY a.id`,
        [series.starts_on, series.ends_on],
      );

      // Sort descending; winner must have strictly more points than second place
      const sorted = [...ptsByPlayer].sort((a, b) => Number(b.pts) - Number(a.pts));
      if (
        sorted.length >= 1 &&
        (sorted.length === 1 || Number(sorted[0].pts) > Number(sorted[1].pts)) &&
        Number(sorted[0].pts) > 0
      ) {
        const wid = sorted[0].account_id;
        seriesWins[wid] = (seriesWins[wid] ?? 0) + 1;
      }
    }

    // ── In-progress players ───────────────────────────────────────────────
    // Players with saved mid-game guesses but no completed result for the date.
    // We colour their partial grids server-side so only the colour pattern
    // (never the letters) leaves the server — same privacy model as completed
    // grids. Drives the live "pressure" view in the leaderboard modal.
    const { rows: wordRows } = await query(
      `SELECT word FROM dirty_wordle_schedule WHERE date = $1`,
      [date],
    );
    const todayWord = wordRows[0]?.word ?? null;
    const completedIds = new Set(todayRows.map(r => r.account_id));
    let inProgress = [];
    if (todayWord) {
      const { rows: progressRows } = await query(
        `SELECT p.account_id, p.guesses, a.name, a.photo_url
           FROM dirty_wordle_progress p
           JOIN accounts a ON a.id = p.account_id
          WHERE p.date = $1`,
        [date],
      );
      inProgress = progressRows
        .filter(r => !completedIds.has(r.account_id) && Array.isArray(r.guesses) && r.guesses.length > 0)
        .map(r => ({
          name:       r.name,
          photo_url:  r.photo_url,
          attempts:   r.guesses.length,
          guess_grid: r.guesses.map(g => evaluateGuess(String(g).toUpperCase(), todayWord)),
        }));
    }

    return {
      date,
      current_series_name: currentSeriesName,
      completed_series_count: completedSeries.length,
      inProgress,
      today: todayRows.map(r => ({
        name:         r.name,
        photo_url:    r.photo_url,
        won:          r.won,
        guesses_taken: r.guesses_taken,
        guess_grid:   r.guess_grid,
        pts:          Number(r.pts ?? 0),
      })),
      allTime: statsRows.map(r => ({
        name:          r.name,
        photo_url:     r.photo_url,
        games_played:  Number(r.games_played),
        wins:          Number(r.wins),
        avg_guesses:   r.avg_guesses != null ? Number(r.avg_guesses) : '-',
        total_pts:     Number(r.total_pts),
        series_wins:   seriesWins[r.account_id] ?? 0,
      })),
    };
  });

  // ── Save in-progress guesses (mid-game persistence) ──────────────────────
  fastify.get('/api/games/dirty-wordle/progress', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);

    // Check in-progress first
    const { rows: progressRows } = await query(
      `SELECT guesses FROM dirty_wordle_progress WHERE account_id = $1 AND date = $2`,
      [accountId, date],
    );
    if (progressRows[0]?.guesses?.length > 0) {
      return { guesses: progressRows[0].guesses };
    }

    // Fall back to completed result (permanent record) if progress is gone
    const { rows: resultRows } = await query(
      `SELECT guesses FROM dirty_wordle_results WHERE account_id = $1 AND date = $2`,
      [accountId, date],
    );
    return { guesses: resultRows[0]?.guesses ?? [] };
  });

  fastify.post('/api/games/dirty-wordle/progress', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { date, guesses } = req.body ?? {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date required (YYYY-MM-DD)' });
    }
    if (!Array.isArray(guesses)) {
      return reply.code(400).send({ error: 'guesses array required' });
    }
    await query(
      `INSERT INTO dirty_wordle_progress (account_id, date, guesses, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (account_id, date)
       DO UPDATE SET guesses = EXCLUDED.guesses, updated_at = NOW()`,
      [accountId, date, JSON.stringify(guesses)],
    );
    return { ok: true };
  });

  // ── Legacy /win kept for backwards compat (redirects to /result) ──────────
  fastify.post('/api/games/dirty-wordle/win', async (req, reply) => {
    return reply.code(410).send({ error: 'Use POST /api/games/dirty-wordle/result' });
  });
}
