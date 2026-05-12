import { query } from '../../db.js';

export async function getActiveWheel() {
  const r = await query(`SELECT * FROM wheels WHERE is_active = true ORDER BY created_at LIMIT 1`);
  return r.rows[0] ?? null;
}
export async function updateWheel(id, patch) {
  const fields = []; const values = []; let i = 1;
  for (const k of ['name','is_active','spin_label','peg_color','text_color','homepage_visible','homepage_title','homepage_subtitle','homepage_days','homepage_start_time','homepage_end_time']) {
    if (k in patch) { fields.push(`${k} = $${i++}`); values.push(patch[k]); }
  }
  if (fields.length === 0) return null;
  fields.push('updated_at = NOW()'); values.push(id);
  const r = await query(`UPDATE wheels SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return r.rows[0];
}
export async function listSegments(wheelId) {
  const r = await query(
    `SELECT s.*, p.name AS product_name, p.thumbnail_url AS product_thumbnail
       FROM wheel_segments s
       LEFT JOIN products p ON p.id = s.product_id
      WHERE s.wheel_id = $1
      ORDER BY s.order_index, s.created_at`,
    [wheelId],
  );
  return r.rows;
}
export async function insertSegment(wheelId, data) {
  const r = await query(
    `INSERT INTO wheel_segments (wheel_id, label, color, award_type, product_id, points_delta, forfeit_text, order_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      wheelId,
      data.label || 'Segment',
      data.color || '#14b8a6',
      data.award_type || 'label',
      data.product_id || null,
      Number.isInteger(data.points_delta) ? data.points_delta : null,
      data.forfeit_text || null,
      Number.isInteger(data.order_index) ? data.order_index : 0,
    ],
  );
  return r.rows[0];
}
export async function updateSegmentById(id, patch) {
  const fields = []; const values = []; let i = 1;
  for (const k of ['label','color','award_type','product_id','points_delta','forfeit_text','order_index']) {
    if (k in patch) { fields.push(`${k} = $${i++}`); values.push(patch[k]); }
  }
  if (fields.length === 0) return null;
  values.push(id);
  const r = await query(`UPDATE wheel_segments SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return r.rows[0];
}
export async function deleteSegmentById(id) {
  await query(`DELETE FROM wheel_segments WHERE id = $1`, [id]);
}
export async function recordSpin(wheelId, accountId, segmentId, summary) {
  await query(
    `INSERT INTO wheel_spins (wheel_id, account_id, segment_id, award_summary) VALUES ($1, $2, $3, $4)`,
    [wheelId, accountId, segmentId, summary],
  );
}
