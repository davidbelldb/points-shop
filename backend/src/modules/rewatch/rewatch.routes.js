import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

// TMDB genre id -> name (movie + TV genres combined; ids are stable).
const TMDB_GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

// The "partner" is simply the other account (this app has exactly two users).
async function getPartner(accountId) {
  const { rows } = await query(
    `SELECT id, name FROM accounts WHERE id <> $1 ORDER BY created_at ASC LIMIT 1`,
    [accountId],
  );
  return rows[0] || null;
}

async function getAccountName(accountId) {
  const { rows } = await query(`SELECT name FROM accounts WHERE id = $1`, [accountId]);
  return rows[0]?.name || 'Someone';
}

// Generic TMDB GET — supports both v3 key and v4 token. Returns parsed JSON or null.
async function tmdbFetch(path, params = {}) {
  const key = (process.env.TMDB_API_KEY || '').trim();
  if (!key) return null;
  try {
    const isV4 = key.startsWith('eyJ');
    const qs = new URLSearchParams(params);
    if (!isV4) qs.set('api_key', key);
    const res = await fetch(
      `https://api.themoviedb.org/3${path}?${qs.toString()}`,
      isV4 ? { headers: { Authorization: `Bearer ${key}` } } : undefined,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function rewatchRoutes(fastify) {
  // The calling account's watch list.
  fastify.get('/api/rewatch', async (req) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT * FROM rewatch_items
        WHERE account_id = $1
        ORDER BY watched ASC, priority DESC, created_at DESC`,
      [meId],
    );
    return rows;
  });

  // Who the "invite" flag targets — the other account's name.
  fastify.get('/api/rewatch/partner', async (req) => {
    const meId = getEffectiveAccountId(req);
    const partner = await getPartner(meId);
    return partner || { id: null, name: 'them' };
  });

  // TMDB type-ahead proxy — supports both v3 key and v4 token.
  fastify.get('/api/rewatch/search', async (req) => {
    const q = (req.query?.q || '').trim();
    const key = (process.env.TMDB_API_KEY || '').trim();
    if (!key) return { configured: false, results: [], error: 'TMDB_API_KEY not set' };
    if (q.length < 2) return { configured: true, results: [] };
    try {
      const isV4Token = key.startsWith('eyJ');
      const base = 'https://api.themoviedb.org/3/search/multi';
      const url = isV4Token
        ? `${base}?include_adult=false&query=${encodeURIComponent(q)}`
        : `${base}?api_key=${encodeURIComponent(key)}&include_adult=false&query=${encodeURIComponent(q)}`;
      const res = await fetch(url, isV4Token ? { headers: { Authorization: `Bearer ${key}` } } : undefined);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        fastify.log.warn({ status: res.status, body: body.slice(0, 200) }, 'tmdb search non-ok');
        return { configured: true, results: [], error: `TMDB HTTP ${res.status}` };
      }
      const data = await res.json();
      const results = (data.results || [])
        .filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && (r.title || r.name))
        .slice(0, 10)
        .map((r) => ({
          tmdb_id: r.id,
          media_type: r.media_type,
          title: r.title || r.name,
          poster_url: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
          tmdb_score: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
          genres: (r.genre_ids || []).map((id) => TMDB_GENRES[id]).filter(Boolean),
          year: (r.release_date || r.first_air_date || '').slice(0, 4),
        }));
      return { configured: true, results };
    } catch (e) {
      fastify.log.error({ err: e }, 'tmdb search failed');
      return { configured: true, results: [], error: `request failed: ${e?.message || e}` };
    }
  });

  // Single item + TMDB details (overview, cast, season summaries).
  fastify.get('/api/rewatch/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT * FROM rewatch_items WHERE id = $1 AND account_id = $2`,
      [req.params.id, meId],
    );
    const item = rows[0];
    if (!item) return reply.code(404).send({ error: 'not found' });

    let tmdb = null;
    if (item.tmdb_id && (item.media_type === 'movie' || item.media_type === 'tv')) {
      const data = await tmdbFetch(`/${item.media_type}/${item.tmdb_id}`, { append_to_response: 'credits' });
      if (data) {
        tmdb = {
          overview: data.overview || '',
          runtime: data.runtime || (Array.isArray(data.episode_run_time) ? data.episode_run_time[0] : null) || null,
          cast: (data.credits?.cast || []).slice(0, 18).map((c) => ({
            name: c.name,
            character: c.character || '',
            profile_url: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
          })),
          seasons: item.media_type === 'tv'
            ? (data.seasons || [])
                .filter((s) => s.season_number > 0)
                .map((s) => ({
                  season_number: s.season_number,
                  name: s.name,
                  episode_count: s.episode_count,
                  air_date: s.air_date,
                }))
            : [],
        };
      }
    }
    return { item, tmdb };
  });

  // Episodes for one season of a TV item.
  fastify.get('/api/rewatch/:id/season/:n', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT tmdb_id, media_type FROM rewatch_items WHERE id = $1 AND account_id = $2`,
      [req.params.id, meId],
    );
    const item = rows[0];
    if (!item || item.media_type !== 'tv' || !item.tmdb_id) {
      return reply.code(404).send({ error: 'not a TV item' });
    }
    const n = Number(req.params.n);
    const data = await tmdbFetch(`/tv/${item.tmdb_id}/season/${n}`);
    if (!data) return { episodes: [] };
    return {
      episodes: (data.episodes || []).map((e) => ({
        episode_number: e.episode_number,
        name: e.name,
        overview: e.overview || '',
        air_date: e.air_date,
        runtime: e.runtime || null,
      })),
    };
  });

  // Add an item.
  fastify.post('/api/rewatch', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const b = req.body ?? {};
    const title = (b.title || '').trim();
    if (!title) return reply.code(400).send({ error: 'title required' });

    const priority = Number.isInteger(b.priority) && b.priority >= 1 && b.priority <= 5 ? b.priority : 3;
    const month = Number.isInteger(b.watch_month) && b.watch_month >= 1 && b.watch_month <= 12 ? b.watch_month : null;
    const year = Number.isInteger(b.watch_year) && b.watch_year >= 2000 && b.watch_year <= 2100 ? b.watch_year : null;
    const genres = Array.isArray(b.genres) ? b.genres.filter((g) => typeof g === 'string').slice(0, 12) : [];
    const score = (typeof b.tmdb_score === 'number' && b.tmdb_score >= 0 && b.tmdb_score <= 10) ? b.tmdb_score : null;
    const mediaType = (b.media_type === 'movie' || b.media_type === 'tv') ? b.media_type : null;
    const seenBefore = b.seen_before !== false; // default true (a rewatch)
    const invitePartner = !!b.invite_partner;

    const { rows } = await query(
      `INSERT INTO rewatch_items
         (account_id, tmdb_id, media_type, title, poster_url, genres, tmdb_score,
          watch_month, watch_year, priority, invite_partner, seen_before)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        meId,
        Number.isInteger(b.tmdb_id) ? b.tmdb_id : null,
        mediaType,
        title,
        typeof b.poster_url === 'string' ? b.poster_url : null,
        genres,
        score,
        month,
        year,
        priority,
        invitePartner,
        seenBefore,
      ],
    );
    const item = rows[0];

    // Notify the partner if invited.
    if (invitePartner) {
      try {
        const partner = await getPartner(meId);
        if (partner) {
          const myName = await getAccountName(meId);
          await query(
            `INSERT INTO notifications (account_id, type, title, body, link_url)
             VALUES ($1, 'watch_invite', $2, $3, '/rewatch')`,
            [partner.id, 'Watch list invite', `${myName} wants to watch ${item.title} with you`],
          );
        }
      } catch (e) {
        fastify.log.error({ err: e }, 'watch invite notification failed');
      }
    }
    return item;
  });

  // Update an item.
  fastify.patch('/api/rewatch/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const patch = req.body ?? {};
    const updates = [];
    const values = [];
    if ('watched' in patch) { values.push(!!patch.watched); updates.push(`watched = $${values.length}`); }
    if ('seen_before' in patch) { values.push(!!patch.seen_before); updates.push(`seen_before = $${values.length}`); }
    if ('invite_partner' in patch) { values.push(!!patch.invite_partner); updates.push(`invite_partner = $${values.length}`); }
    if ('priority' in patch && Number.isInteger(patch.priority) && patch.priority >= 1 && patch.priority <= 5) {
      values.push(patch.priority); updates.push(`priority = $${values.length}`);
    }
    if ('watch_month' in patch && Number.isInteger(patch.watch_month) && patch.watch_month >= 1 && patch.watch_month <= 12) {
      values.push(patch.watch_month); updates.push(`watch_month = $${values.length}`);
    }
    if ('watch_year' in patch && Number.isInteger(patch.watch_year)) {
      values.push(patch.watch_year); updates.push(`watch_year = $${values.length}`);
    }
    if (!updates.length) return reply.code(400).send({ error: 'nothing to update' });
    values.push(req.params.id, meId);
    const r = await query(
      `UPDATE rewatch_items SET ${updates.join(', ')}
        WHERE id = $${values.length - 1} AND account_id = $${values.length}
        RETURNING *`,
      values,
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'not found' });
    return r.rows[0];
  });

  // Remove an item.
  fastify.delete('/api/rewatch/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const r = await query(
      `DELETE FROM rewatch_items WHERE id = $1 AND account_id = $2 RETURNING id`,
      [req.params.id, meId],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
