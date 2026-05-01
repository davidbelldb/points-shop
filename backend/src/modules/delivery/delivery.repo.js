import { query } from '../../db.js';

export async function listActiveDeliveryOptions() {
  const { rows } = await query(
    `SELECT id, name, points, sort_order
       FROM delivery_options
      WHERE is_active = TRUE
      ORDER BY sort_order, points`,
  );
  return rows;
}

export async function getDeliveryOptionById(id) {
  const { rows } = await query(
    `SELECT id, name, points, is_active
       FROM delivery_options WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getDefaultDeliveryOptionId() {
  const { rows } = await query(
    `SELECT id FROM delivery_options
      WHERE is_active = TRUE
      ORDER BY sort_order, points
      LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}
