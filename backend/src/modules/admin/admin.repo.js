import bcrypt from 'bcryptjs';
import { pool, query } from '../../db.js';
import { getDefaultAccountId } from '../accounts/accounts.repo.js';
import { sendPush } from '../notifications/push.js';

const PRODUCT_FIELDS = ['name', 'sku', 'description', 'price_points', 'thumbnail_url', 'is_active'];
const ACCOUNT_FIELDS = ['name', 'email', 'photo_url'];

export async function listAllProducts() {
  const { rows } = await query(
    `SELECT
        p.id, p.sku, p.name, p.description, p.price_points,
        p.thumbnail_url, p.is_active, p.created_at,
        COALESCE(i.stock_qty, 0)      AS stock_qty,
        COALESCE(i.lead_time_days, 0) AS lead_time_days,
        COALESCE(
          (SELECT json_agg(
                    json_build_object(
                      'id', m.id,
                      'media_type', m.media_type,
                      'url', m.url,
                      'sort_order', m.sort_order
                    )
                    ORDER BY m.sort_order, m.id
                  )
             FROM product_media m
            WHERE m.product_id = p.id),
          '[]'::json
        ) AS media
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id
      ORDER BY p.created_at DESC`,
  );
  return rows;
}

export async function getAdminProduct(id) {
  const { rows } = await query(
    `SELECT
        p.id, p.sku, p.name, p.description, p.price_points,
        p.thumbnail_url, p.is_active,
        COALESCE(i.stock_qty, 0)      AS stock_qty,
        COALESCE(i.lead_time_days, 0) AS lead_time_days
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const media = await query(
    `SELECT id, media_type, url, sort_order
       FROM product_media
      WHERE product_id = $1
      ORDER BY sort_order, id`,
    [id],
  );
  return { ...rows[0], media: media.rows };
}

export async function createProduct(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productRes = await client.query(
      `INSERT INTO products (sku, name, description, price_points, thumbnail_url, is_active)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE))
       RETURNING id`,
      [
        data.sku,
        data.name,
        data.description ?? null,
        data.price_points,
        data.thumbnail_url ?? null,
        data.is_active,
      ],
    );
    const id = productRes.rows[0].id;
    await client.query(
      `INSERT INTO inventory (product_id, stock_qty, lead_time_days)
       VALUES ($1, $2, $3)`,
      [id, data.stock_qty ?? 0, data.lead_time_days ?? 0],
    );
    await client.query('COMMIT');
    return getAdminProduct(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateProduct(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of PRODUCT_FIELDS) {
    if (key in patch) {
      fields.push(`${key} = $${i++}`);
      values.push(patch[key]);
    }
  }
  if (fields.length === 0) return getAdminProduct(id);
  fields.push(`updated_at = NOW()`);
  values.push(id);
  await query(`UPDATE products SET ${fields.join(', ')} WHERE id = $${i}`, values);
  return getAdminProduct(id);
}

export async function setInventory(productId, stockQty, leadTimeDays) {
  await query(
    `INSERT INTO inventory (product_id, stock_qty, lead_time_days, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (product_id) DO UPDATE
       SET stock_qty       = EXCLUDED.stock_qty,
           lead_time_days  = EXCLUDED.lead_time_days,
           updated_at      = NOW()`,
    [productId, stockQty, leadTimeDays],
  );
}

export async function addProductMedia(productId, { url, media_type, sort_order = 0 }) {
  const { rows } = await query(
    `INSERT INTO product_media (product_id, media_type, url, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, media_type, url, sort_order`,
    [productId, media_type, url, sort_order],
  );
  return rows[0];
}

export async function deleteProductMedia(mediaId) {
  await query(`DELETE FROM product_media WHERE id = $1`, [mediaId]);
}

export async function updateAccount(patch) {
  const accountId = getDefaultAccountId();
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of ACCOUNT_FIELDS) {
    if (key in patch) {
      fields.push(`${key} = $${i++}`);
      values.push(patch[key]);
    }
  }
  if (fields.length === 0) return;
  fields.push(`updated_at = NOW()`);
  values.push(accountId);
  await query(`UPDATE accounts SET ${fields.join(', ')} WHERE id = $${i}`, values);
}

// Change the password of the non-admin (other) account.
export async function changeOtherUserPassword(newPassword) {
  const { rows } = await query(
    `SELECT id FROM accounts WHERE role != 'admin' ORDER BY created_at LIMIT 1`,
  );
  if (!rows[0]) throw Object.assign(new Error('No non-admin account found'), { statusCode: 404 });
  const hash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, rows[0].id]);
}

export async function adjustPoints(delta, reason, accountId = null) {
  const targetId = accountId || getDefaultAccountId();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const accRes = await client.query(
      `SELECT points_balance FROM accounts WHERE id = $1 FOR UPDATE`,
      [targetId],
    );
    if (accRes.rows.length === 0) throw new Error('Account not found');
    const newBalance = accRes.rows[0].points_balance + delta;
    if (newBalance < 0) throw new Error('Resulting balance would be negative');
    await client.query(
      `UPDATE accounts SET points_balance = $1, updated_at = NOW() WHERE id = $2`,
      [newBalance, targetId],
    );
    await client.query(
      `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
      [targetId, delta, reason],
    );
    const sign = delta > 0 ? '+' : '';
    await client.query(
      `INSERT INTO notifications (account_id, type, title, body)
       VALUES ($1, 'points_adjust', $2, $3)`,
      [targetId, `${sign}${delta} pts`, reason],
    );
    sendPush(targetId, { title: `${sign}${delta} pts`, body: reason, url: '/account' });
    await client.query('COMMIT');
    return newBalance;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
