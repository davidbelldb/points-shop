/**
 * Just Say The Word — backend routes
 *
 * A daily pronunciation game. 5 words/day (same for both players). The client
 * captures speech and runs Azure Pronunciation Assessment, then posts the score;
 * we map it to points and persist, mirroring Dirty Wordle's schedule/results/
 * series/leaderboard model.
 *
 * Points per word: 100→16, 80–99→12, 60–79→8, 40–59→4, <40→0  (max 16/word)
 *
 * Env: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (e.g. "uksouth").
 */

import { getEffectiveAccountId, isAdmin } from '../auth/auth.helpers.js';
import { creditPoints } from './games.repo.js';
import { query, pool } from '../../db.js';

const AZURE_KEY = process.env.AZURE_SPEECH_KEY || '';
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || '';

function pointsForScore(score) {
  const s = Number(score) || 0;
  if (s >= 100) return 16;
  if (s >= 80) return 12;
  if (s >= 60) return 8;
  if (s >= 40) return 4;
  return 0;
}

function todayUK() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

async function getConfig() {
  const { rows } = await query(`SELECT * FROM jstw_config WHERE id = 1`);
  return rows[0] ?? null;
}

// Assign (or return) the day's words. Same set for both players. Words cycle
// through the eligible bank (filtered by the configured length/syllable bands)
// before repeating.
async function getOrAssignWords(date, cfg) {
  const { rows: existing } = await query(
    `SELECT word_index, word, syllables FROM jstw_schedule WHERE date = $1 ORDER BY word_index`,
    [date],
  );
  if (existing.length > 0) return existing;

  const n = Math.max(1, Number(cfg.words_per_day) || 5);
  const band = [cfg.min_len, cfg.max_len, cfg.min_syllables, cfg.max_syllables];

  const client = await pool.connect();
  const claimed = [];
  try {
    await client.query('BEGIN');
    const claimOne = async () => {
      const { rows } = await client.query(
        `UPDATE jstw_word_bank SET used_on = $1
          WHERE word = (
            SELECT word FROM jstw_word_bank
             WHERE used_on IS NULL
               AND length BETWEEN $2 AND $3
               AND syllable_count BETWEEN $4 AND $5
             ORDER BY random() LIMIT 1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING word, syllables`,
        [date, ...band],
      );
      return rows[0] ?? null;
    };
    let resetUsed = false;
    while (claimed.length < n) {
      let w = await claimOne();
      if (!w && !resetUsed) {
        // Eligible bank exhausted — start a fresh cycle for this band.
        resetUsed = true;
        await client.query(
          `UPDATE jstw_word_bank SET used_on = NULL
            WHERE length BETWEEN $1 AND $2 AND syllable_count BETWEEN $3 AND $4`,
          band,
        );
        w = await claimOne();
      }
      if (!w) break; // band has fewer than n words total — serve what we have
      claimed.push(w);
    }
    for (let i = 0; i < claimed.length; i += 1) {
      await client.query(
        `INSERT INTO jstw_schedule (date, word_index, word, syllables)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (date, word_index) DO NOTHING`,
        [date, i, claimed[i].word, JSON.stringify(claimed[i].syllables)],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const { rows: final } = await query(
    `SELECT word_index, word, syllables FROM jstw_schedule WHERE date = $1 ORDER BY word_index`,
    [date],
  );
  // If another request won the schedule, release any of our claims it didn't use.
  const keep = new Set(final.map((r) => r.word));
  for (const c of claimed) {
    if (!keep.has(c.word)) {
      await query(`UPDATE jstw_word_bank SET used_on = NULL WHERE word = $1`, [c.word]).catch(() => {});
    }
  }
  return final;
}

export default async function justSayTheWordRoutes(fastify) {
  // ── Short-lived Azure auth token (keeps the subscription key server-side) ──
  fastify.get('/api/games/just-say-the-word/speech-token', async (req, reply) => {
    if (!AZURE_KEY || !AZURE_REGION) {
      return reply.code(503).send({ error: 'Speech scoring is not configured yet.' });
    }
    try {
      const res = await fetch(
        `https://${AZURE_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY, 'Content-Length': '0' } },
      );
      if (!res.ok) return reply.code(502).send({ error: 'Could not get a speech token.' });
      const token = await res.text();
      return { token, region: AZURE_REGION };
    } catch {
      return reply.code(502).send({ error: 'Could not get a speech token.' });
    }
  });

  // ── Today's words ──────────────────────────────────────────────────────────
  fastify.get('/api/games/just-say-the-word/words', async (req, reply) => {
    const cfg = await getConfig();
    if (!cfg) return reply.code(500).send({ error: 'Not configured' });
    // Hidden until enabled — but the admin can always test.
    if (!cfg.enabled && !isAdmin(req)) return reply.code(404).send({ error: 'Not found' });
    const date = req.query.date ?? todayUK();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply.code(400).send({ error: 'date must be YYYY-MM-DD' });
    const words = await getOrAssignWords(date, cfg);
    return {
      date,
      words_per_day: cfg.words_per_day,
      score_floor: cfg.score_floor ?? 0,
      countdown_seconds: cfg.countdown_seconds ?? 4,
      words,
    };
  });

  // ── This player's progress today (words already attempted) ─────────────────
  fastify.get('/api/games/just-say-the-word/progress', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const date = req.query.date ?? todayUK();
    const { rows } = await query(
      `SELECT word_index, word, score, points, syllables
         FROM jstw_results WHERE account_id = $1 AND date = $2 ORDER BY word_index`,
      [accountId, date],
    );
    return { date, results: rows };
  });

  // ── Save one word's result + credit points (idempotent per word) ───────────
  fastify.post('/api/games/just-say-the-word/result', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { date, word_index, word, score, syllables } = req.body ?? {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply.code(400).send({ error: 'date required' });
    if (!Number.isInteger(word_index) || word_index < 0) return reply.code(400).send({ error: 'word_index required' });
    const sc = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    const pts = pointsForScore(sc);

    // First write wins (idempotent) — re-attempts don't change the recorded score.
    const { rows } = await query(
      `INSERT INTO jstw_results (account_id, date, word_index, word, score, points, syllables)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (account_id, date, word_index) DO NOTHING
       RETURNING points`,
      [accountId, date, word_index, String(word ?? ''), sc, pts, JSON.stringify(Array.isArray(syllables) ? syllables : [])],
    );
    if (rows.length === 0) {
      const { rows: prev } = await query(
        `SELECT points FROM jstw_results WHERE account_id = $1 AND date = $2 AND word_index = $3`,
        [accountId, date, word_index],
      );
      return { points: prev[0]?.points ?? 0, alreadySaved: true };
    }
    if (pts > 0) await creditPoints(accountId, pts, `jstw:${date}:${word_index}`);
    return { points: pts };
  });

  // ── Leaderboard (today's per-word scores + all-time + series) ──────────────
  fastify.get('/api/games/just-say-the-word/leaderboard', async (req) => {
    const date = req.query.date ?? todayUK();
    const cfg = await getConfig();

    // Today: every account, with their per-word rows for this date.
    const { rows: people } = await query(
      `SELECT id AS account_id, name, photo_url FROM accounts ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at`,
    );
    const { rows: todayRows } = await query(
      `SELECT account_id, word_index, word, score, points, syllables
         FROM jstw_results WHERE date = $1 ORDER BY account_id, word_index`,
      [date],
    );
    const byAccountToday = {};
    for (const r of todayRows) (byAccountToday[r.account_id] ??= []).push(r);

    // All-time: games (words) attempted, avg score, total points.
    const { rows: stats } = await query(
      `SELECT a.id AS account_id, a.name, a.photo_url,
              COUNT(r.*)                                   AS words_attempted,
              ROUND(AVG(r.score)::numeric, 0)              AS avg_score,
              COALESCE(SUM(r.points), 0)                   AS total_pts
         FROM accounts a
         LEFT JOIN jstw_results r ON r.account_id = a.id
        GROUP BY a.id, a.name, a.photo_url`,
    );
    const statsBy = Object.fromEntries(stats.map((s) => [s.account_id, s]));

    // Series wins (completed series only): most points in the window.
    const { rows: completed } = await query(
      `SELECT starts_on, ends_on FROM jstw_series WHERE ends_on < CURRENT_DATE ORDER BY starts_on`,
    );
    const seriesWins = {};
    for (const s of completed) {
      const { rows: pp } = await query(
        `SELECT a.id AS account_id, COALESCE(SUM(r.points), 0) AS pts
           FROM accounts a
           LEFT JOIN jstw_results r ON r.account_id = a.id AND r.date BETWEEN $1 AND $2
          GROUP BY a.id`,
        [s.starts_on, s.ends_on],
      );
      const sorted = [...pp].sort((x, y) => Number(y.pts) - Number(x.pts));
      if (sorted.length && Number(sorted[0].pts) > 0 && (sorted.length === 1 || Number(sorted[0].pts) > Number(sorted[1].pts))) {
        seriesWins[sorted[0].account_id] = (seriesWins[sorted[0].account_id] ?? 0) + 1;
      }
    }

    return {
      date,
      words_per_day: cfg?.words_per_day ?? 5,
      completed_series_count: completed.length,
      today: people.map((p) => {
        const words = byAccountToday[p.account_id] ?? [];
        return {
          name: p.name,
          photo_url: p.photo_url,
          words: words.map((w) => ({ word_index: w.word_index, word: w.word, score: w.score, points: w.points, syllables: w.syllables })),
          total: words.reduce((a, w) => a + Number(w.points), 0),
          attempted: words.length,
        };
      }),
      allTime: people.map((p) => {
        const s = statsBy[p.account_id] ?? {};
        return {
          name: p.name,
          photo_url: p.photo_url,
          words_attempted: Number(s.words_attempted ?? 0),
          avg_score: s.avg_score != null ? Number(s.avg_score) : '-',
          total_pts: Number(s.total_pts ?? 0),
          series_wins: seriesWins[p.account_id] ?? 0,
        };
      }),
    };
  });

  // ── Admin: config ──────────────────────────────────────────────────────────
  const CFG_COLS = new Set(['enabled', 'min_len', 'max_len', 'min_syllables', 'max_syllables', 'words_per_day', 'score_floor', 'countdown_seconds']);
  fastify.get('/api/games/just-say-the-word/config', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return getConfig();
  });
  fastify.put('/api/games/just-say-the-word/config', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const sets = []; const vals = []; let i = 1;
    for (const [k, v] of Object.entries(req.body ?? {})) {
      if (!CFG_COLS.has(k)) continue;
      sets.push(`${k} = $${i++}`); vals.push(v);
    }
    if (sets.length) {
      sets.push('updated_at = NOW()');
      await query(`UPDATE jstw_config SET ${sets.join(', ')} WHERE id = 1`, vals);
    }
    return getConfig();
  });

  // ── Admin: re-roll today's words (testing) ──────────────────────────────────
  // Clears today's schedule + everyone's results for today, frees the words back
  // to the bank, and claws back any points credited today — a clean re-test.
  fastify.post('/api/games/just-say-the-word/reroll', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const date = todayUK();
    await query(
      `UPDATE jstw_word_bank SET used_on = NULL
        WHERE word IN (SELECT word FROM jstw_schedule WHERE date = $1)`,
      [date],
    );
    await query(`DELETE FROM jstw_schedule WHERE date = $1`, [date]);
    await query(`DELETE FROM jstw_results WHERE date = $1`, [date]);
    // Reverse today's points so repeated testing doesn't inflate balances.
    const { rows } = await query(
      `SELECT account_id, COALESCE(SUM(delta), 0) AS pts
         FROM points_ledger WHERE reason LIKE $1 GROUP BY account_id`,
      [`jstw:${date}%`],
    );
    for (const r of rows) {
      if (Number(r.pts) !== 0) {
        await query(`UPDATE accounts SET points_balance = points_balance - $1 WHERE id = $2`, [Number(r.pts), r.account_id]);
      }
    }
    await query(`DELETE FROM points_ledger WHERE reason LIKE $1`, [`jstw:${date}%`]);
    return { ok: true, date };
  });

  // ── Admin: auto-syllabify via Azure (TTS the word → assess it → read back
  //          Azure's own syllable graphemes). Free under the F0 tier. ──────────
  fastify.post('/api/games/just-say-the-word/syllabify', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    if (!AZURE_KEY || !AZURE_REGION) return reply.code(503).send({ error: 'Azure speech not configured.' });
    const word = String(req.body?.word ?? '').trim();
    if (!word || !/^[a-zA-Z'-]+$/.test(word)) return reply.code(400).send({ error: 'A single word (letters only) is required.' });
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    try {
      // 1) Synthesize the word to 16k mono PCM WAV.
      const ttsRes = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'riff-16khz-16bit-mono-pcm',
          'User-Agent': 'SneakyStuff',
        },
        body: `<speak version='1.0' xml:lang='en-GB'><voice name='en-GB-SoniaNeural'>${esc(word)}</voice></speak>`,
      });
      if (!ttsRes.ok) return reply.code(502).send({ error: 'Could not synthesize the word.' });
      const wav = Buffer.from(await ttsRes.arrayBuffer());

      // 2) Pronunciation-assess that audio to get the syllable breakdown.
      const pa = Buffer.from(JSON.stringify({
        referenceText: word, gradingSystem: 'HundredMark', granularity: 'Phoneme', dimension: 'Comprehensive',
      })).toString('base64');
      const sttRes = await fetch(
        `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-GB&format=detailed`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': pa,
            Accept: 'application/json',
          },
          body: wav,
        },
      );
      if (!sttRes.ok) return reply.code(502).send({ error: 'Could not analyse the word.' });
      const json = await sttRes.json();
      const syllables = [];
      for (const w of (json?.NBest?.[0]?.Words ?? [])) {
        for (const sy of (w.Syllables ?? [])) {
          const g = String(sy.Grapheme || sy.Syllable || '').trim().toLowerCase();
          if (g) syllables.push(g);
        }
      }
      if (syllables.length === 0) return reply.code(422).send({ error: 'Azure returned no syllables — enter them manually.' });
      return { word: word.toUpperCase(), syllables };
    } catch {
      return reply.code(502).send({ error: 'Auto-syllabify failed — try again or enter manually.' });
    }
  });

  // ── Admin: word bank ────────────────────────────────────────────────────────
  fastify.get('/api/games/just-say-the-word/words-bank', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const { rows } = await query(
      `SELECT word, syllables, length, syllable_count, used_on FROM jstw_word_bank ORDER BY length, word`,
    );
    return { words: rows };
  });
  fastify.post('/api/games/just-say-the-word/words-bank', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const word = String(req.body?.word ?? '').trim().toUpperCase();
    const syllables = Array.isArray(req.body?.syllables) ? req.body.syllables.map((s) => String(s).trim()).filter(Boolean) : [];
    if (!word || syllables.length === 0) return reply.code(400).send({ error: 'word and syllables[] required' });
    await query(
      `INSERT INTO jstw_word_bank (word, syllables) VALUES ($1, $2)
       ON CONFLICT (word) DO UPDATE SET syllables = EXCLUDED.syllables, used_on = NULL`,
      [word, JSON.stringify(syllables)],
    );
    return { ok: true };
  });
  fastify.delete('/api/games/just-say-the-word/words-bank/:word', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    await query(`DELETE FROM jstw_word_bank WHERE word = $1`, [String(req.params.word).toUpperCase()]);
    return { ok: true };
  });
}
