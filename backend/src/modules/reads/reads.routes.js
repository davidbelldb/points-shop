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

// Google Books search — used as a secondary source alongside Open Library.
// Open Library's catalogue lags for upcoming/not-yet-published titles (it's
// sourced from library MARC records + Internet Archive ingestion, both of
// which happen at/after publication); Google Books gets pre-release metadata
// and cover art from publishers, so it fills that gap and often has better
// cover-image coverage too. Works without a key (lower, shared quota) — set
// GOOGLE_BOOKS_API_KEY to use your own quota.
async function googleBooksFetch(q) {
  const key = (process.env.GOOGLE_BOOKS_API_KEY || '').trim();
  const qs = new URLSearchParams({ q, maxResults: '12' });
  if (key) qs.set('key', key);
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${qs.toString()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function mapGoogleItem(v) {
  const info = v.volumeInfo || {};
  const ids = info.industryIdentifiers || [];
  const isbn = ids.find((i) => i.type === 'ISBN_13')?.identifier || ids[0]?.identifier || null;
  let cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
  if (cover) cover = cover.replace(/^http:/, 'https:');
  return {
    source_id: v.id ? `gbooks:${v.id}` : null,
    title: info.title || 'Untitled',
    author: (info.authors || []).join(', ') || null,
    cover_url: cover,
    genres: (info.categories || []).slice(0, 4),
    rating: typeof info.averageRating === 'number' ? info.averageRating : null,
    page_count: Number.isInteger(info.pageCount) ? info.pageCount : null,
    year: info.publishedDate ? String(info.publishedDate).slice(0, 4) : '',
    isbn,
  };
}

// Loose dedupe key — same title + first author, case/whitespace-insensitive.
function dedupeKey(title, author) {
  return `${(title || '').toLowerCase().trim()}|${(author || '').toLowerCase().trim().split(',')[0]}`;
}

// Extra detail for a single item's source page — description, page count,
// publisher/edition info — fetched live from whichever catalogue the item
// came from (Open Library work key or a "gbooks:<volumeId>" id).
async function fetchReadDetail(sourceId) {
  if (!sourceId) return null;

  if (sourceId.startsWith('gbooks:')) {
    const volumeId = sourceId.slice('gbooks:'.length);
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      const info = data.volumeInfo || {};
      const ids = info.industryIdentifiers || [];
      return {
        source: 'google',
        description: info.description || null,
        subtitle: info.subtitle || null,
        page_count: Number.isInteger(info.pageCount) ? info.pageCount : null,
        published_date: info.publishedDate || null,
        publisher: info.publisher || null,
        subjects: (info.categories || []).slice(0, 10),
        subject_places: [],
        subject_times: [],
        subject_people: [],
        language: info.language || null,
        rating: typeof info.averageRating === 'number' ? info.averageRating : null,
        ratings_count: Number.isInteger(info.ratingsCount) ? info.ratingsCount : null,
        isbn: ids.find((i) => i.type === 'ISBN_13')?.identifier || ids[0]?.identifier || null,
        external_url: (info.infoLink || info.canonicalVolumeLink || '').replace(/^http:/, 'https:')
          || `https://books.google.com/books?id=${encodeURIComponent(volumeId)}`,
        editions: [],
      };
    } catch {
      return null;
    }
  }

  if (sourceId.startsWith('/works/')) {
    const headers = { 'User-Agent': 'sneaky-reads/1.0 (points-shop; davidbell.db@googlemail.com)' };
    try {
      const [workRes, editionsRes] = await Promise.all([
        fetch(`https://openlibrary.org${sourceId}.json`, { headers }),
        fetch(`https://openlibrary.org${sourceId}/editions.json?limit=50`, { headers }),
      ]);
      const work = workRes.ok ? await workRes.json() : null;
      const editionsData = editionsRes.ok ? await editionsRes.json() : null;

      const description = typeof work?.description === 'string'
        ? work.description
        : work?.description?.value || null;

      const rawEditions = (editionsData?.entries || []).map((e) => ({
        edition_name: e.edition_name || null, // e.g. "1st edition", "Anniversary edition"
        physical_format: e.physical_format || null, // e.g. "Hardcover", "Paperback", "Ebook"
        subtitle: e.subtitle || null,
        publish_date: e.publish_date || null,
        publishers: e.publishers || [],
        number_of_pages: Number.isInteger(e.number_of_pages) ? e.number_of_pages : null,
        isbn_13: (e.isbn_13 || [])[0] || null,
        language: (e.languages || [])[0]?.key?.replace('/languages/', '') || null,
      }));

      // The full editions list is mostly regional/publisher reprints with the
      // same content — not useful as a "1st / 2nd edition" list. Instead,
      // surface only entries that actually describe an edition number or a
      // physical format, deduped on that combination, sorted earliest first.
      const seenEd = new Set();
      const editions = rawEditions
        .filter((e) => e.edition_name || e.physical_format)
        .filter((e) => {
          const k = `${(e.edition_name || '').toLowerCase()}|${(e.physical_format || '').toLowerCase()}`;
          if (seenEd.has(k)) return false;
          seenEd.add(k);
          return true;
        })
        .sort((a, b) => (a.publish_date || '').localeCompare(b.publish_date || ''))
        .slice(0, 10)
        .map((e) => ({
          edition_name: e.edition_name,
          physical_format: e.physical_format,
          publish_date: e.publish_date,
          number_of_pages: e.number_of_pages,
          language: e.language,
        }));

      if (!work && rawEditions.length === 0) return null;

      return {
        source: 'openlibrary',
        description,
        subtitle: work?.subtitle || rawEditions.find((e) => e.subtitle)?.subtitle || null,
        page_count: rawEditions.find((e) => e.number_of_pages)?.number_of_pages || null,
        published_date: work?.first_publish_date || null,
        publisher: rawEditions.find((e) => e.publishers.length)?.publishers?.[0] || null,
        subjects: (work?.subjects || []).slice(0, 10),
        subject_places: (work?.subject_places || []).slice(0, 6),
        subject_times: (work?.subject_times || []).slice(0, 6),
        subject_people: (work?.subject_people || []).slice(0, 6),
        language: rawEditions.find((e) => e.language)?.language || null,
        rating: null,
        ratings_count: null,
        isbn: rawEditions.find((e) => e.isbn_13)?.isbn_13 || null,
        external_url: `https://openlibrary.org${sourceId}`,
        editions,
      };
    } catch {
      return null;
    }
  }

  return null;
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

  // Open Library + Google Books type-ahead proxy. Open Library gives broad
  // catalogue coverage; Google Books fills gaps on upcoming/new titles and
  // often has better cover art. Results are merged and deduped by title+author.
  fastify.get('/api/reads/search', async (req) => {
    const q = (req.query?.q || '').trim();
    if (q.length < 2) return { configured: true, results: [] };

    const [olData, gbData] = await Promise.all([
      openLibraryFetch('/search.json', {
        q,
        limit: 12,
        fields: 'key,title,author_name,cover_i,first_publish_year,subject,isbn,ratings_average,number_of_pages_median',
      }),
      googleBooksFetch(q),
    ]);

    const olResults = (olData?.docs || [])
      .map(mapDoc)
      .filter((r) => r.title && r.title !== 'Untitled');
    const gbResults = (gbData?.items || [])
      .map(mapGoogleItem)
      .filter((r) => r.title && r.title !== 'Untitled');

    // Open Library first (broader), then merge in Google Books: fill gaps
    // (e.g. missing cover/rating/page count) on existing matches, and append
    // any titles Google Books has that Open Library doesn't (new/upcoming).
    const seen = new Map();
    const results = [];
    for (const r of olResults) {
      seen.set(dedupeKey(r.title, r.author), r);
      results.push(r);
    }
    for (const r of gbResults) {
      const k = dedupeKey(r.title, r.author);
      const existing = seen.get(k);
      if (existing) {
        existing.cover_url ||= r.cover_url;
        existing.rating ??= r.rating;
        existing.page_count ??= r.page_count;
        if (!existing.genres?.length && r.genres?.length) existing.genres = r.genres;
        continue;
      }
      seen.set(k, r);
      results.push(r);
    }

    if (!olData && !gbData) return { configured: true, results: [], error: 'request failed' };
    return { configured: true, results: results.slice(0, 14) };
  });

  // A single item plus extra catalogue detail (description, page count,
  // editions) fetched live from its source (Open Library or Google Books).
  fastify.get('/api/reads/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT r.*, a.name AS suggested_by_name
         FROM reads_items r
         LEFT JOIN accounts a ON a.id = r.suggested_by
        WHERE r.id = $1 AND r.account_id = $2`,
      [req.params.id, meId],
    );
    const item = rows[0];
    if (!item) return reply.code(404).send({ error: 'not found' });
    const detail = await fetchReadDetail(item.source_id);
    return { item, detail };
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
