/**
 * Games play list — structural replica of the rewatch module, backed by
 * IGDB (Twitch) instead of TMDB. Covers, platforms, ratings, screenshots.
 *
 * Auth: Twitch client-credentials OAuth (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
 * in .env), token cached until near expiry — same pattern as FatSecret was.
 */

import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { sendPush } from '../notifications/push.js';
import { config } from '../../config.js';

// ── IGDB client ───────────────────────────────────────────────────────────────
let igdbToken = null; // { token, exp }

const igdbEnabled = () => !!(config.twitch.clientId && config.twitch.clientSecret);

async function igdbGetToken() {
  if (!igdbEnabled()) return null;
  if (igdbToken && Date.now() < igdbToken.exp - 60_000) return igdbToken.token;
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(config.twitch.clientId)}` +
      `&client_secret=${encodeURIComponent(config.twitch.clientSecret)}&grant_type=client_credentials`,
      { method: 'POST' },
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.access_token) return null;
    igdbToken = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
    return igdbToken.token;
  } catch {
    return null;
  }
}

/** POST an APOC query to an IGDB endpoint. Returns parsed JSON or null. */
async function igdbFetch(endpoint, body) {
  const token = await igdbGetToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': config.twitch.clientId,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const coverUrl = (imageId, size = 't_cover_big') =>
  imageId ? `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg` : null;

const score10 = (totalRating) =>
  typeof totalRating === 'number' ? Math.round(totalRating) / 10 : null;

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

export default async function playlistRoutes(fastify) {
  // The calling account's play list.
  fastify.get('/api/playlist', async (req) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT * FROM playlist_items
        WHERE account_id = $1
        ORDER BY played ASC, priority DESC, created_at DESC`,
      [meId],
    );
    return rows;
  });

  // Who the "invite" flag targets — the other account's name.
  fastify.get('/api/playlist/partner', async (req) => {
    const meId = getEffectiveAccountId(req);
    const partner = await getPartner(meId);
    return partner || { id: null, name: 'them' };
  });

  // IGDB type-ahead proxy.
  fastify.get('/api/playlist/search', async (req) => {
    const q = (req.query?.q || '').trim();
    if (!igdbEnabled()) return { configured: false, results: [], error: 'TWITCH_CLIENT_ID/SECRET not set' };
    if (q.length < 2) return { configured: true, results: [] };
    try {
      const data = await igdbFetch('games',
        `search "${q.replace(/"/g, '')}";` +
        ` fields name, cover.image_id, platforms.abbreviation, platforms.name,` +
        ` genres.name, total_rating, first_release_date;` +
        ` limit 10;`,
      );
      if (!data) return { configured: true, results: [], error: 'IGDB request failed — check credentials' };
      const results = data
        .filter((g) => g.name)
        .map((g) => ({
          igdb_id: g.id,
          title: g.name,
          cover_url: coverUrl(g.cover?.image_id),
          igdb_score: score10(g.total_rating),
          genres: (g.genres || []).map((x) => x.name).filter(Boolean),
          platforms: (g.platforms || []).map((p) => p.abbreviation || p.name).filter(Boolean),
          year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear().toString() : '',
        }));
      return { configured: true, results };
    } catch (e) {
      fastify.log.error({ err: e }, 'igdb search failed');
      return { configured: true, results: [], error: `request failed: ${e?.message || e}` };
    }
  });

  // Pending invites addressed to the calling account.
  fastify.get('/api/playlist/invites', async (req) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT i.*, a.name AS from_name
         FROM playlist_invites i
         JOIN accounts a ON a.id = i.from_account_id
        WHERE i.to_account_id = $1 AND i.status = 'pending'
        ORDER BY i.created_at DESC`,
      [meId],
    );
    return rows;
  });

  // Single item + IGDB details (summary, developers, screenshots).
  fastify.get('/api/playlist/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT * FROM playlist_items WHERE id = $1 AND account_id = $2`,
      [req.params.id, meId],
    );
    const item = rows[0];
    if (!item) return reply.code(404).send({ error: 'not found' });

    let igdb = null;
    if (item.igdb_id) {
      const data = await igdbFetch('games',
        `fields summary, storyline, first_release_date, total_rating,` +
        ` platforms.name, screenshots.image_id,` +
        ` involved_companies.company.name, involved_companies.developer;` +
        ` where id = ${Number(item.igdb_id)};`,
      );
      const g = Array.isArray(data) ? data[0] : null;
      if (g) {
        igdb = {
          summary: g.summary || g.storyline || '',
          year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
          platforms: (g.platforms || []).map((p) => p.name).filter(Boolean),
          developers: (g.involved_companies || [])
            .filter((c) => c.developer && c.company?.name)
            .map((c) => c.company.name)
            .slice(0, 4),
          screenshots: (g.screenshots || [])
            .slice(0, 8)
            .map((s) => coverUrl(s.image_id, 't_screenshot_med'))
            .filter(Boolean),
        };
      }
    }
    return { item, igdb };
  });

  // Add an item.
  fastify.post('/api/playlist', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const b = req.body ?? {};
    const title = (b.title || '').trim();
    if (!title) return reply.code(400).send({ error: 'title required' });

    const priority = Number.isInteger(b.priority) && b.priority >= 1 && b.priority <= 5 ? b.priority : 3;
    const month = Number.isInteger(b.play_month) && b.play_month >= 1 && b.play_month <= 12 ? b.play_month : null;
    const year = Number.isInteger(b.play_year) && b.play_year >= 2000 && b.play_year <= 2100 ? b.play_year : null;
    const genres = Array.isArray(b.genres) ? b.genres.filter((g) => typeof g === 'string').slice(0, 12) : [];
    const platforms = Array.isArray(b.platforms) ? b.platforms.filter((p) => typeof p === 'string').slice(0, 16) : [];
    const score = (typeof b.igdb_score === 'number' && b.igdb_score >= 0 && b.igdb_score <= 10) ? b.igdb_score : null;
    const playedBefore = b.played_before !== false; // default true (a replay)
    const invitePartner = !!b.invite_partner;

    const { rows } = await query(
      `INSERT INTO playlist_items
         (account_id, igdb_id, title, cover_url, genres, platforms, igdb_score,
          play_month, play_year, priority, invite_partner, played_before)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        meId,
        Number.isInteger(b.igdb_id) ? b.igdb_id : null,
        title,
        typeof b.cover_url === 'string' ? b.cover_url : null,
        genres,
        platforms,
        score,
        month,
        year,
        priority,
        invitePartner,
        playedBefore,
      ],
    );
    const item = rows[0];

    // Create a pending invite + notify the partner if invited.
    if (invitePartner) {
      try {
        const partner = await getPartner(meId);
        if (partner) {
          const myName = await getAccountName(meId);
          await query(
            `INSERT INTO playlist_invites
               (from_account_id, to_account_id, igdb_id, title, cover_url, genres, platforms, igdb_score, priority)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [meId, partner.id, item.igdb_id, item.title, item.cover_url, item.genres, item.platforms, item.igdb_score, item.priority],
          );
          await query(
            `INSERT INTO notifications (account_id, type, title, body, link_url)
             VALUES ($1, 'play_invite', $2, $3, '/playlist')`,
            [partner.id, 'Play list invite', `${myName} wants to play ${item.title} with you`],
          );
          sendPush(partner.id, {
            title: 'Play list invite',
            body: `${myName} wants to play ${item.title} with you`,
            url: '/playlist',
          });
        }
      } catch (e) {
        fastify.log.error({ err: e }, 'play invite creation failed');
      }
    }
    return item;
  });

  // Accept an invite — copies the game onto the invitee's list.
  fastify.post('/api/playlist/invites/:id/accept', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const playedBefore = (req.body?.played_before) !== false; // default true
    const { rows } = await query(
      `SELECT * FROM playlist_invites WHERE id = $1 AND to_account_id = $2 AND status = 'pending'`,
      [req.params.id, meId],
    );
    const inv = rows[0];
    if (!inv) return reply.code(404).send({ error: 'invite not found' });
    await query(
      `INSERT INTO playlist_items
         (account_id, igdb_id, title, cover_url, genres, platforms, igdb_score, priority, played_before)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [meId, inv.igdb_id, inv.title, inv.cover_url, inv.genres, inv.platforms, inv.igdb_score, inv.priority, playedBefore],
    );
    await query(`UPDATE playlist_invites SET status = 'accepted' WHERE id = $1`, [inv.id]);
    return { ok: true };
  });

  // Decline an invite.
  fastify.post('/api/playlist/invites/:id/decline', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const r = await query(
      `UPDATE playlist_invites SET status = 'declined'
        WHERE id = $1 AND to_account_id = $2 AND status = 'pending' RETURNING id`,
      [req.params.id, meId],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'invite not found' });
    return { ok: true };
  });

  // Update an item.
  fastify.patch('/api/playlist/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const patch = req.body ?? {};
    const updates = [];
    const values = [];
    if ('played' in patch) { values.push(!!patch.played); updates.push(`played = $${values.length}`); }
    if ('played_before' in patch) { values.push(!!patch.played_before); updates.push(`played_before = $${values.length}`); }
    if ('invite_partner' in patch) { values.push(!!patch.invite_partner); updates.push(`invite_partner = $${values.length}`); }
    if ('priority' in patch && Number.isInteger(patch.priority) && patch.priority >= 1 && patch.priority <= 5) {
      values.push(patch.priority); updates.push(`priority = $${values.length}`);
    }
    if ('play_month' in patch && Number.isInteger(patch.play_month) && patch.play_month >= 1 && patch.play_month <= 12) {
      values.push(patch.play_month); updates.push(`play_month = $${values.length}`);
    }
    if ('play_year' in patch && Number.isInteger(patch.play_year)) {
      values.push(patch.play_year); updates.push(`play_year = $${values.length}`);
    }
    if (!updates.length) return reply.code(400).send({ error: 'nothing to update' });
    values.push(req.params.id, meId);
    const r = await query(
      `UPDATE playlist_items SET ${updates.join(', ')}
        WHERE id = $${values.length - 1} AND account_id = $${values.length}
        RETURNING *`,
      values,
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'not found' });
    return r.rows[0];
  });

  // Remove an item.
  fastify.delete('/api/playlist/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const r = await query(
      `DELETE FROM playlist_items WHERE id = $1 AND account_id = $2 RETURNING id`,
      [req.params.id, meId],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
