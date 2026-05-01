import { query } from '../../db.js';
import { getDefaultAccountId } from '../accounts/accounts.repo.js';
import { findValidCodeByCode, calculateDiscount } from '../discounts/discounts.repo.js';
import { getDefaultDeliveryOptionId, getDeliveryOptionById } from '../delivery/delivery.repo.js';

async function getOrCreateBasketId() {
  const accountId = getDefaultAccountId();
  const existing = await query(
    `SELECT id FROM baskets WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [accountId],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const defaultDeliveryId = await getDefaultDeliveryOptionId();
  const created = await query(
    `INSERT INTO baskets (account_id, delivery_option_id) VALUES ($1, $2) RETURNING id`,
    [accountId, defaultDeliveryId],
  );
  return created.rows[0].id;
}

export async function getBasket() {
  const basketId = await getOrCreateBasketId();

  const itemsRes = await query(
    `SELECT bi.id, bi.product_id, bi.qty,
            p.name, p.price_points, p.thumbnail_url,
            COALESCE(i.stock_qty, 0) AS stock_qty,
            (bi.qty * p.price_points) AS line_total
       FROM basket_items bi
       JOIN products  p ON p.id = bi.product_id
       LEFT JOIN inventory i ON i.product_id = bi.product_id
      WHERE bi.basket_id = $1
      ORDER BY p.name`,
    [basketId],
  );
  const subtotal_points = itemsRes.rows.reduce((s, r) => s + Number(r.line_total), 0);
  const item_count = itemsRes.rows.reduce((s, r) => s + r.qty, 0);

  const basketRes = await query(
    `SELECT discount_code_id, delivery_option_id FROM baskets WHERE id = $1`,
    [basketId],
  );
  const codeId = basketRes.rows[0]?.discount_code_id;
  const deliveryId = basketRes.rows[0]?.delivery_option_id;

  let discount = null;
  let discount_points = 0;
  if (codeId) {
    const codeRes = await query(
      `SELECT id, code, description, discount_type, discount_value,
              is_active, max_uses, uses_count, valid_from, valid_until
         FROM discount_codes WHERE id = $1`,
      [codeId],
    );
    if (codeRes.rows.length > 0) {
      const c = codeRes.rows[0];
      const now = new Date();
      const valid =
        c.is_active &&
        (c.max_uses == null || c.uses_count < c.max_uses) &&
        (!c.valid_from || new Date(c.valid_from) <= now) &&
        (!c.valid_until || new Date(c.valid_until) >= now);
      if (valid) {
        discount_points = calculateDiscount(c, subtotal_points);
        discount = {
          id: c.id, code: c.code, description: c.description,
          discount_type: c.discount_type, discount_value: c.discount_value,
          discount_points,
        };
      }
    }
    if (!discount) {
      await query(`UPDATE baskets SET discount_code_id = NULL WHERE id = $1`, [basketId]);
    }
  }

  let delivery = null;
  let delivery_points = 0;
  if (deliveryId) {
    const dRes = await query(
      `SELECT id, name, points FROM delivery_options
        WHERE id = $1 AND is_active = TRUE`,
      [deliveryId],
    );
    if (dRes.rows.length > 0) {
      delivery = dRes.rows[0];
      delivery_points = delivery.points;
    } else {
      await query(`UPDATE baskets SET delivery_option_id = NULL WHERE id = $1`, [basketId]);
    }
  }

  const total_points = Math.max(0, subtotal_points - discount_points) + delivery_points;

  return {
    basket_id: basketId,
    items: itemsRes.rows,
    subtotal_points,
    discount,
    discount_points,
    delivery,
    delivery_points,
    total_points,
    item_count,
  };
}

export async function addItem(productId, qty = 1) {
  const basketId = await getOrCreateBasketId();
  await query(
    `INSERT INTO basket_items (basket_id, product_id, qty) VALUES ($1, $2, $3)
     ON CONFLICT (basket_id, product_id)
       DO UPDATE SET qty = basket_items.qty + EXCLUDED.qty`,
    [basketId, productId, qty],
  );
  return getBasket();
}

export async function setItemQty(productId, qty) {
  const basketId = await getOrCreateBasketId();
  if (qty <= 0) {
    await query(`DELETE FROM basket_items WHERE basket_id = $1 AND product_id = $2`, [basketId, productId]);
  } else {
    await query(`UPDATE basket_items SET qty = $1 WHERE basket_id = $2 AND product_id = $3`, [qty, basketId, productId]);
  }
  return getBasket();
}

export async function removeItem(productId) {
  const basketId = await getOrCreateBasketId();
  await query(`DELETE FROM basket_items WHERE basket_id = $1 AND product_id = $2`, [basketId, productId]);
  return getBasket();
}

export async function applyPromoCode(code) {
  const basketId = await getOrCreateBasketId();
  const found = await findValidCodeByCode(code);
  if (!found) {
    const err = new Error('Invalid or expired code');
    err.statusCode = 400;
    throw err;
  }
  await query(`UPDATE baskets SET discount_code_id = $1 WHERE id = $2`, [found.id, basketId]);
  return getBasket();
}

export async function removePromoCode() {
  const basketId = await getOrCreateBasketId();
  await query(`UPDATE baskets SET discount_code_id = NULL WHERE id = $1`, [basketId]);
  return getBasket();
}

export async function setDeliveryOption(deliveryOptionId) {
  const basketId = await getOrCreateBasketId();
  if (deliveryOptionId == null) {
    await query(`UPDATE baskets SET delivery_option_id = NULL WHERE id = $1`, [basketId]);
  } else {
    const opt = await getDeliveryOptionById(deliveryOptionId);
    if (!opt || !opt.is_active) {
      const err = new Error('Invalid delivery option');
      err.statusCode = 400;
      throw err;
    }
    await query(`UPDATE baskets SET delivery_option_id = $1 WHERE id = $2`, [deliveryOptionId, basketId]);
  }
  return getBasket();
}
