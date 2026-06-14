import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { sendPush } from '../notifications/push.js';

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

// Open Library search — free, no API key, and one of the broadest book
// catalogues around (backed by the Internet Archive). Open Library asks
// API consumers to send a descriptive User-Agent.
async function openLibraryFetch(path, params = {}) {
  const qs = new URLSearchParams(params);
  try {
    const res = await fetch(`https://openlibrary.org${path}?${qs.toString()}`, {
      headers: { 'User-Agent': 'sneaky-reads/1.0 (points-shop; davidbell.db@googlemail.com)' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function mapDoc(d) {
  const coverId = Number.isInteger(d.cover_i) ? d.cover_i : null;
  return {
    source_id: d.key || null, // e.g. "/works/OL12345W"
    title: d.title || 'Untitled',
    author: (d.author_name || []).join(', ') || null,
    cover_url: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    genres: (d.subject || []).slice(0, 4),
    rating: typeof d.ratings_average === 'number' ? Math.round(d.ratings_average * 10) / 10 : null,
    page_count: Number.isInteger(d.number_of_pages_median) ? d.number_of_pages_median : null,
    year: d.first_publish_year ? String(d.first_publish_year) : '',
    isbn: (d.isbn || [])[0] || null,
  };
}

export default async function readsRoutes(fastify) {
  // The calling account's reading list, including books suggested to them.
  fastify.get('/api/reads', async (req) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT r.*, a.name AS suggested_by_name
         FROM reads_items r
         LEFT JOIN accounts a ON a.id = r.suggested_by
        WHERE r.account_id = $1
        ORDER BY r.read ASC, r.priority DESC, r.created_at DESC`,
      [meId],
    );
    return rows;
  });

  // Who the "suggest" option targets — the other account's name.
  fastify.get('/api/reads/partner', async (req) => {
    const meId = getEffectiveAccountId(req);
    const partner = await getPartner(meId);
    return partner || { id: null, name: 'them' };
  });

  // Open Library type-ahead proxy.
  fastify.get('/api/reads/search', async (req) => {
    const q = (req.query?.q || '').trim();
    if (q.length < 2) return { configured: true, results: [] };
    const data = await openLibraryFetch('/search.json', {
      q,
      limit: 12,
      fields: 'key,title,author_name,cover_i,first_publish_year,subject,isbn,ratings_average,number_of_pages_median',
    });
    if (!data) return { configured: true, results: [], error: 'request failed' };
    const results = (data.docs || [])
      .map(mapDoc)
      .filter((r) => r.title && r.title !== 'Untitled');
    return { configured: true, results };
  });

  // Add a book.
  fastify.post('/api/reads', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const b = req.body ?? {};
    const title = (b.title || '').trim();
    if (!title) return reply.code(400).send({ error: 'title required' });

    const priority = Number.isInteger(b.priority) && b.priority >= 1 && b.priority <= 5 ? b.priority : 3;
    const genres = Array.isArray(b.genres) ? b.genres.filter((g) => typeof g === 'string').slice(0, 8) : [];
    const rating = (typeof b.rating === 'number' && b.rating >= 0 && b.rating <= 5) ? b.rating : null;
    const pageCount = Number.isInteger(b.page_count) ? b.page_count : null;
    const suggestPartner = !!b.suggest_to_partner;

    const { rows } = await query(
      `INSERT INTO reads_items
         (account_id, source_id, title, author, cover_url, genres, rating, page_count, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        meId,
        typeof b.source_id === 'string' ? b.source_id : null,
        title,
        typeof b.author === 'string' ? b.author : null,
        typeof b.cover_url === 'string' ? b.cover_url : null,
        genres,
        rating,
        pageCount,
        priority,
      ],
    );
    const item = rows[0];

    // Drop a copy straight into the partner's "Suggested reads" — no
    // accept/decline step, unlike the rewatch invite flow.
    if (suggestPartner) {
      try {
        const partner = await getPartner(meId);
        if (partner) {
          const myName = await getAccountName(meId);
          await query(
            `INSERT INTO reads_items
               (account_id, suggested_by, source_id, title, author, cover_url, genres, rating, page_count, priority, suggested)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, TRUE)`,
            [partner.id, meId, item.source_id, item.title, item.author, item.cover_url, item.genres, item.rating, item.page_count, item.priority],
          );
          await query(
            `INSERT INTO notifications (account_id, type, title, body, link_url)
             VALUES ($1, 'read_suggestion', $2, $3, '/sneaky-reads')`,
            [partner.id, 'Reading suggestion', `${myName} thinks you'd like "${item.title}"`],
          );
          sendPush(partner.id, {
            title: 'Reading suggestion',
            body: `${myName} thinks you'd like "${item.title}"`,
            url: '/sneaky-reads',
          });
        }
      } catch (e) {
        fastify.log.error({ err: e }, 'read suggestion creation failed');
      }
    }
    return item;
  });

  // Update an item — mark read, move out of "suggested", or change priority.
  fastify.patch('/api/reads/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const patch = req.body ?? {};
    const updates = [];
    const values = [];
    if ('read' in patch) { values.push(!!patch.read); updates.push(`read = $${values.length}`); }
    if ('suggested' in patch) { values.push(!!patch.suggested); updates.push(`suggested = $${values.length}`); }
    if ('priority' in patch && Number.isInteger(patch.priority) && patch.priority >= 1 && patch.priority <= 5) {
      values.push(patch.priority); updates.push(`priority = $${values.length}`);
    }
    if (!updates.length) return reply.code(400).send({ error: 'nothing to update' });
    values.push(req.params.id, meId);
    const r = await query(
      `UPDATE reads_items SET ${updates.join(', ')}
        WHERE id = $${values.length - 1} AND account_id = $${values.length}
        RETURNING *`,
      values,
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'not found' });
    return r.rows[0];
  });

  // Remove an item.
  fastify.delete('/api/reads/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const r = await query(
      `DELETE FROM reads_items WHERE id = $1 AND account_id = $2 RETURNING id`,
      [req.params.id, meId],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
