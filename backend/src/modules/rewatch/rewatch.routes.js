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

export default async function rewatchRoutes(fastify) {
  // List the calling account's rewatch items.
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

  // TMDB type-ahead proxy — keeps the API key server-side.
  fastify.get('/api/rewatch/search', async (req) => {
    const q = (req.query?.q || '').trim();
    const key = process.env.TMDB_API_KEY;
    if (!key) return { configured: false, results: [] };
    if (q.length < 2) return { configured: true, results: [] };
    try {
      const url = `https://api.themoviedb.org/3/search/multi?api_key=${key}&include_adult=false&query=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) {
        fastify.log.warn({ status: res.status }, 'tmdb search non-ok');
        return { configured: true, results: [] };
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
      return { configured: true, results: [] };
    }
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

    const { rows } = await query(
      `INSERT INTO rewatch_items
         (account_id, tmdb_id, media_type, title, poster_url, genres, tmdb_score,
          watch_month, watch_year, priority, invite_david)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
        !!b.invite_david,
      ],
    );
    return rows[0];
  });

  // Update an item (watched toggle, priority, invite flag).
  fastify.patch('/api/rewatch/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const patch = req.body ?? {};
    const updates = [];
    const values = [];
    if ('watched' in patch) { values.push(!!patch.watched); updates.push(`watched = $${values.length}`); }
    if ('invite_david' in patch) { values.push(!!patch.invite_david); updates.push(`invite_david = $${values.length}`); }
    if ('priority' in patch && Number.isInteger(patch.priority) && patch.priority >= 1 && patch.priority <= 5) {
      values.push(patch.priority); updates.push(`priority = $${values.length}`);
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
