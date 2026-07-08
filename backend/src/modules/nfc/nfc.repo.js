import { randomBytes } from 'node:crypto';
import { query } from '../../db.js';

/* Slots joined to their currently-assigned story (thumbnail + caption summary,
   NULL story fields when unassigned). Newest slot first. */
export async function listSlots() {
  const { rows } = await query(
    `SELECT n.id, n.slug, n.label, n.story_id, n.updated_at,
            s.caption      AS story_caption,
            s.media_type   AS story_media_type,
            COALESCE(s.thumbnail_url, s.media_url) AS story_thumb,
            s.created_at   AS story_created_at
       FROM nfc_slots n
       LEFT JOIN sneaky_stories s ON s.id = n.story_id
      ORDER BY n.id DESC`,
  );
  return rows;
}

export async function createSlot(label) {
  const slug = randomBytes(6).toString('hex'); // 12 chars, unguessable
  const { rows } = await query(
    `INSERT INTO nfc_slots (slug, label) VALUES ($1, $2)
     RETURNING id, slug, label, story_id, updated_at`,
    [slug, String(label || '').trim() || 'Untitled tag'],
  );
  return rows[0];
}

/* Patch a slot's label and/or assigned story. Pass story_id: null to clear. */
export async function updateSlot(id, { label, story_id }) {
  const sets = [];
  const params = [];
  if (label !== undefined)    { params.push(String(label).trim()); sets.push(`label = $${params.length}`); }
  if (story_id !== undefined) { params.push(story_id || null);     sets.push(`story_id = $${params.length}`); }
  if (!sets.length) return getSlotById(id);
  params.push(id);
  const { rows } = await query(
    `UPDATE nfc_slots SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length}
      RETURNING id, slug, label, story_id, updated_at`,
    params,
  );
  return rows[0] ?? null;
}

export async function deleteSlot(id) {
  await query(`DELETE FROM nfc_slots WHERE id = $1`, [id]);
  return { ok: true };
}

export async function getSlotById(id) {
  const { rows } = await query(`SELECT id, slug, label, story_id, updated_at FROM nfc_slots WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getSlotBySlug(slug) {
  const { rows } = await query(`SELECT id, slug, label, story_id FROM nfc_slots WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

/* Stories authored by `authorId` for the assignment picker — newest first,
   with a thumbnail and whether each is a hidden (secret) story. */
export async function listAuthorStories(authorId, limit = 60) {
  const { rows } = await query(
    `SELECT s.id, s.caption, s.media_type,
            COALESCE(s.thumbnail_url, s.media_url) AS thumb,
            s.created_at, s.expires_at,
            (s.secret_token IS NOT NULL) AS secret
       FROM sneaky_stories s
      WHERE s.author_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2`,
    [authorId, limit],
  );
  return rows;
}
