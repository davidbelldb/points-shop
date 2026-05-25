import { query } from '../../db.js';

const FIELDS = ['name', 'audio_url', 'sort_order', 'is_active'];

export async function listActiveAudioNotes() {
  const { rows } = await query(
    `SELECT id, name, audio_url, sort_order
       FROM audio_notes WHERE is_active = TRUE
      ORDER BY sort_order, created_at`,
  );
  return rows;
}

export async function listAllAudioNotes() {
  const { rows } = await query(
    `SELECT id, name, audio_url, sort_order, is_active, created_at
       FROM audio_notes ORDER BY sort_order, created_at`,
  );
  return rows;
}

export async function createAudioNote(d) {
  const { rows } = await query(
    `INSERT INTO audio_notes (name, audio_url, sort_order, is_active)
     VALUES ($1, $2, $3, COALESCE($4, TRUE)) RETURNING *`,
    [d.name ?? '', d.audio_url, d.sort_order ?? 0, d.is_active],
  );
  return rows[0];
}

export async function updateAudioNote(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of FIELDS) {
    if (k in patch) { fields.push(`${k} = $${i++}`); values.push(patch[k]); }
  }
  if (fields.length === 0) {
    const { rows } = await query(`SELECT * FROM audio_notes WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  values.push(id);
  const { rows } = await query(
    `UPDATE audio_notes SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteAudioNote(id) {
  await query(`DELETE FROM audio_notes WHERE id = $1`, [id]);
}
