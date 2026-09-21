import { query } from '../../db.js';

const FIELDS = ['image_url', 'title', 'subtitle', 'code', 'link_url', 'placement', 'sort_order', 'is_active', 'audience'];

// A caller sees their own audience's slides plus anything marked 'both'.
export async function listActiveSlides(placement = 'top', audience = 'adult') {
  const { rows } = await query(
    `SELECT id, image_url, title, subtitle, code, link_url, placement, sort_order, audience
       FROM hero_slides
      WHERE is_active = TRUE AND placement = $1
        AND (audience = $2 OR audience = 'both')
      ORDER BY sort_order, created_at`,
    [placement, audience],
  );
  return rows;
}

export async function listAllSlides() {
  const { rows } = await query(
    `SELECT id, image_url, title, subtitle, code, link_url, placement,
            sort_order, is_active, audience, created_at
       FROM hero_slides
      ORDER BY placement, sort_order, created_at`,
  );
  return rows;
}

export async function createSlide(d) {
  const { rows } = await query(
    `INSERT INTO hero_slides (image_url, title, subtitle, code, link_url, placement, sort_order, is_active, audience)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'top'), $7, COALESCE($8, TRUE), COALESCE($9, 'adult'))
     RETURNING *`,
    [
      d.image_url,
      d.title ?? null, d.subtitle ?? null, d.code ?? null, d.link_url ?? null,
      d.placement, d.sort_order ?? 0, d.is_active, d.audience,
    ],
  );
  return rows[0];
}

export async function updateSlide(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of FIELDS) {
    if (k in patch) { fields.push(`${k} = $${i++}`); values.push(patch[k]); }
  }
  if (fields.length === 0) {
    const { rows } = await query(`SELECT * FROM hero_slides WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  values.push(id);
  const { rows } = await query(
    `UPDATE hero_slides SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteSlide(id) {
  await query(`DELETE FROM hero_slides WHERE id = $1`, [id]);
}
