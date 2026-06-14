import { query } from '../../db.js';

/**
 * The Sneakyscapes garden is a singleton (one shared layout, row id = 1).
 * Returns { placements: [...], updated_at }.
 */
export async function getGarden() {
  const { rows } = await query(
    `SELECT placements, updated_at FROM sneakyscapes_garden WHERE id = 1`,
  );
  return rows[0] ?? { placements: [], updated_at: null };
}

/**
 * Replace the whole layout in one shot (the client owns the full placements
 * array, so a full upsert is the simplest correct model — no per-tile diffing).
 */
export async function saveGarden(accountId, placements) {
  const { rows } = await query(
    `INSERT INTO sneakyscapes_garden (id, placements, updated_by, updated_at)
     VALUES (1, $1::jsonb, $2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET placements = EXCLUDED.placements,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
     RETURNING placements, updated_at`,
    [JSON.stringify(placements), accountId],
  );
  return rows[0];
}
