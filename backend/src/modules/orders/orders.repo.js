import { pool } from '../../db.js';
import { getDefaultAccountId } from '../accounts/accounts.repo.js';
import { calculateDiscount } from '../discounts/discounts.repo.js';

export class HttpError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

const VALID_STATUSES = ['placed', 'dispatched', 'delivered', 'cancelled', 'deleted'];

export async function placeOrder() {
  const accountId = getDefaultAccountId();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const accountRes = await client.query(
      `SELECT id, name, email, points_balance FROM accounts WHERE id = $1 FOR UPDATE`,
      [accountId],
    );
    if (accountRes.rows.length === 0) throw new HttpError(404, 'Account not found');
    const account = accountRes.rows[0];

    const basketRes = await client.query(
      `SELECT id, discount_code_id, delivery_option_id, notes
         FROM baskets WHERE account_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [accountId],
    );
    if (basketRes.rows.length === 0) throw new HttpError(400, 'Basket is empty');
    const basket = basketRes.rows[0];

    const itemsRes = await client.query(
      `SELECT bi.product_id, bi.qty, p.name, p.price_points, i.stock_qty
         FROM basket_items bi
         JOIN products  p ON p.id = bi.product_id
         JOIN inventory i ON i.product_id = bi.product_id
        WHERE bi.basket_id = $1
        FOR UPDATE OF i`,
      [basket.id],
    );
    if (itemsRes.rows.length === 0) throw new HttpError(400, 'Basket is empty');

    const understocked = itemsRes.rows.find((r) => r.qty > r.stock_qty);
    if (understocked) throw new HttpError(409, `Not enough stock for ${understocked.name}`);

    const subtotal = itemsRes.rows.reduce((s, r) => s + r.qty * r.price_points, 0);

    let discountCode = null;
    let discountPoints = 0;
    if (basket.discount_code_id) {
      const cr = await client.query(`SELECT * FROM discount_codes WHERE id = $1 FOR UPDATE`, [basket.discount_code_id]);
      if (cr.rows.length > 0) {
        const c = cr.rows[0];
        const now = new Date();
        const valid = c.is_active
          && (c.max_uses == null || c.uses_count < c.max_uses)
          && (!c.valid_from  || new Date(c.valid_from)  <= now)
          && (!c.valid_until || new Date(c.valid_until) >= now);
        if (valid) { discountPoints = calculateDiscount(c, subtotal); discountCode = c; }
      }
    }

    let deliveryOption = null;
    let deliveryPoints = 0;
    if (basket.delivery_option_id) {
      const dr = await client.query(
        `SELECT id, name, points FROM delivery_options
          WHERE id = $1 AND is_active = TRUE`,
        [basket.delivery_option_id],
      );
      if (dr.rows.length > 0) {
        deliveryOption = dr.rows[0];
        deliveryPoints = deliveryOption.points;
      }
    }

    const total = Math.max(0, subtotal - discountPoints) + deliveryPoints;
    if (account.points_balance < total) throw new HttpError(402, 'Insufficient points');

    const orderRes = await client.query(
      `INSERT INTO orders
         (account_id, status, total_points,
          discount_code_id, discount_points, discount_code_snapshot,
          delivery_option_id, delivery_points, delivery_name_snapshot,
          notes)
       VALUES ($1, 'placed', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        accountId, total,
        discountCode?.id ?? null, discountPoints, discountCode?.code ?? null,
        deliveryOption?.id ?? null, deliveryPoints, deliveryOption?.name ?? null,
        basket.notes ?? null,
      ],
    );
    const orderId = orderRes.rows[0].id;

    for (const item of itemsRes.rows) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, qty, unit_price_points, line_total_points)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.product_id, item.name, item.qty, item.price_points, item.qty * item.price_points],
      );
      await client.query(
        `UPDATE inventory SET stock_qty = stock_qty - $1, updated_at = NOW() WHERE product_id = $2`,
        [item.qty, item.product_id],
      );
    }

    await client.query(
      `UPDATE accounts SET points_balance = points_balance - $1, updated_at = NOW() WHERE id = $2`,
      [total, accountId],
    );
    await client.query(
      `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
      [accountId, -total, `order:${orderId}`],
    );

    if (discountCode) {
      await client.query(`UPDATE discount_codes SET uses_count = uses_count + 1 WHERE id = $1`, [discountCode.id]);
    }

    await client.query(`DELETE FROM basket_items WHERE basket_id = $1`, [basket.id]);

    const defaultRes = await client.query(
      `SELECT id FROM delivery_options WHERE is_active = TRUE ORDER BY sort_order, points LIMIT 1`,
    );
    const defaultDeliveryId = defaultRes.rows[0]?.id ?? null;
    await client.query(
      `UPDATE baskets SET discount_code_id = NULL, delivery_option_id = $1, notes = NULL WHERE id = $2`,
      [defaultDeliveryId, basket.id],
    );

    await client.query('COMMIT');
    return getOrderById(orderId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrderById(id) {
  const orderRes = await pool.query(
    `SELECT o.id, o.account_id, o.status, o.total_points,
            o.discount_points, o.discount_code_snapshot,
            o.delivery_points, o.delivery_name_snapshot,
            o.notes,
            o.created_at, o.updated_at,
            a.name AS account_name, a.email AS account_email
       FROM orders o JOIN accounts a ON a.id = o.account_id
      WHERE o.id = $1`,
    [id],
  );
  if (orderRes.rows.length === 0) return null;

  const itemsRes = await pool.query(
    `SELECT id, product_id, product_name, qty, unit_price_points, line_total_points
       FROM order_items WHERE order_id = $1 ORDER BY product_name`,
    [id],
  );
  const subtotal = itemsRes.rows.reduce((s, r) => s + r.line_total_points, 0);
  return { ...orderRes.rows[0], subtotal_points: subtotal, items: itemsRes.rows };
}

export async function listOrders({ bucket = 'all', limit = 50 } = {}) {
  const accountId = getDefaultAccountId();
  let where = `account_id = $1 AND status != 'deleted'`;
  if (bucket === 'open') where = `account_id = $1 AND status IN ('placed','dispatched')`;
  if (bucket === 'past') where = `account_id = $1 AND status IN ('delivered','cancelled')`;
  const { rows } = await pool.query(
    `SELECT id, status, total_points, discount_points, discount_code_snapshot,
            delivery_points, delivery_name_snapshot, notes, created_at
       FROM orders WHERE ${where}
      ORDER BY created_at DESC LIMIT $2`,
    [accountId, limit],
  );
  return rows;
}

export async function listAllOrders(limit = 100) {
  const { rows } = await pool.query(
    `SELECT o.id, o.status, o.total_points, o.created_at, o.updated_at,
            o.discount_code_snapshot, o.delivery_name_snapshot, o.notes,
            COUNT(oi.id) AS item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function updateOrderStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) {
    const err = new Error(`Invalid status: ${status}`);
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await pool.query(
    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
    [status, id],
  );
  return rows[0] ?? null;
}
