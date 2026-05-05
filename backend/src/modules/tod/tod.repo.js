import { query } from '../../db.js';

export async function listAllPrompts() {
  const { rows } = await query(
    `SELECT id, type, text, is_active, created_at
       FROM truth_or_dare_prompts
      ORDER BY type, created_at DESC`,
  );
  return rows;
}

export async function getRandomPrompt(type) {
  const { rows } = await query(
    `SELECT id, type, text
       FROM truth_or_dare_prompts
      WHERE type = $1 AND is_active = TRUE
      ORDER BY RANDOM() LIMIT 1`,
    [type],
  );
  return rows[0] ?? null;
}

export async function createPrompt(type, text) {
  const trimmed = text.trim();
  const { rows } = await query(
    `INSERT INTO truth_or_dare_prompts (type, text) VALUES ($1, $2) RETURNING *`,
    [type, trimmed],
  );
  return rows[0];
}

export async function updatePrompt(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of ['type', 'text', 'is_active']) {
    if (k in patch) { fields.push(`${k} = $${i++}`); values.push(patch[k]); }
  }
  if (fields.length === 0) return null;
  values.push(id);
  const { rows } = await query(
    `UPDATE truth_or_dare_prompts SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deletePrompt(id) {
  await query(`DELETE FROM truth_or_dare_prompts WHERE id = $1`, [id]);
}
