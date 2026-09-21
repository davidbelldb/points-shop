import { query } from '../../db.js';

// `audience` is the caller's: they see their own items plus anything marked
// 'both'. Admin listings pass 'all' to see the lot.
export async function listActiveProducts(audience = 'adult') {
  const { rows } = await query(`
    SELECT
      p.id, p.sku, p.name, p.description, p.price_points, p.thumbnail_url,
      p.audience, p.created_at,
      COALESCE(i.stock_qty, 0)      AS stock_qty,
      COALESCE(i.lead_time_days, 0) AS lead_time_days
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id
    WHERE p.is_active = TRUE
      AND ($1 = 'all' OR p.audience = $1 OR p.audience = 'both')
    ORDER BY p.created_at DESC
  `, [audience]);
  return rows;
}

export async function getProductById(id, audience = 'adult') {
  const productRes = await query(
    `SELECT
        p.id, p.sku, p.name, p.description, p.price_points, p.thumbnail_url,
        p.audience,
        COALESCE(i.stock_qty, 0)      AS stock_qty,
        COALESCE(i.lead_time_days, 0) AS lead_time_days
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = $1 AND p.is_active = TRUE
        AND ($2 = 'all' OR p.audience = $2 OR p.audience = 'both')`,
    [id, audience],
  );

  if (productRes.rows.length === 0) return null;

  const mediaRes = await query(
    `SELECT id, media_type, url, sort_order
       FROM product_media
      WHERE product_id = $1
      ORDER BY sort_order ASC`,
    [id],
  );

  return { ...productRes.rows[0], media: mediaRes.rows };
}
