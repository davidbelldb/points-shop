import { query } from '../../db.js';

const EDITABLE = [
  'description', 'discount_type', 'discount_value',
  'max_uses', 'valid_from', 'valid_until', 'is_active',
];

export async function listDiscountCodes() {
  const { rows } = await query(
    `SELECT id, code, description, discount_type, discount_value,
            max_uses, uses_count, valid_from, valid_until, is_active, created_at
       FROM discount_codes
      ORDER BY created_at DESC`,
  );
  return rows;
}

export async function createDiscountCode(d) {
  const { rows } = await query(
    `INSERT INTO discount_codes
       (code, description, discount_type, discount_value,
        max_uses, valid_from, valid_until, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE))
     RETURNING *`,
    [
      d.code.toUpperCase(),
      d.description ?? null,
      d.discount_type,
      d.discount_value,
      d.max_uses ?? null,
      d.valid_from ?? null,
      d.valid_until ?? null,
      d.is_active,
    ],
  );
  return rows[0];
}

export async function updateDiscountCode(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of EDITABLE) {
    if (k in patch) {
      fields.push(`${k} = $${i++}`);
      values.push(patch[k]);
    }
  }
  if (fields.length === 0) {
    const { rows } = await query(`SELECT * FROM discount_codes WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  values.push(id);
  const { rows } = await query(
    `UPDATE discount_codes SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteDiscountCode(id) {
  await query(`DELETE FROM discount_codes WHERE id = $1`, [id]);
}

export async function findValidCodeByCode(code) {
  const { rows } = await query(
    `SELECT * FROM discount_codes
      WHERE UPPER(code) = UPPER($1)
        AND is_active = TRUE
        AND (valid_from  IS NULL OR valid_from  <= NOW())
        AND (valid_until IS NULL OR valid_until >= NOW())
        AND (max_uses    IS NULL OR uses_count < max_uses)
      LIMIT 1`,
    [code],
  );
  return rows[0] ?? null;
}

export function calculateDiscount(code, subtotal) {
  if (!code) return 0;
  if (code.discount_type === 'percent') {
    return Math.floor((subtotal * code.discount_value) / 100);
  }
  if (code.discount_type === 'fixed') {
    return Math.min(subtotal, code.discount_value);
  }
  return 0;
}
