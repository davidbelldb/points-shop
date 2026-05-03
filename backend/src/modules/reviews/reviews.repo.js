import { query } from '../../db.js';
import { getDefaultAccountId } from '../accounts/accounts.repo.js';

export async function listReviewsForProduct(productId) {
  const { rows } = await query(
    `SELECT r.id, r.body, r.thumbs_up_count, r.created_at, r.updated_at,
            a.id AS account_id, a.name AS account_name, a.photo_url AS account_photo
       FROM product_reviews r
       JOIN accounts a ON a.id = r.account_id
      WHERE r.product_id = $1
      ORDER BY r.created_at DESC`,
    [productId],
  );
  return rows;
}

export async function createReview(productId, body) {
  const accountId = getDefaultAccountId();
  const trimmed = body.trim();
  if (!trimmed) {
    const err = new Error('Body required');
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await query(
    `INSERT INTO product_reviews (product_id, account_id, body)
     VALUES ($1, $2, $3) RETURNING id, body, created_at, updated_at`,
    [productId, accountId, trimmed],
  );
  return rows[0];
}

export async function updateReview(reviewId, body) {
  const trimmed = body.trim();
  if (!trimmed) {
    const err = new Error('Body required');
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await query(
    `UPDATE product_reviews SET body = $1, updated_at = NOW()
      WHERE id = $2 RETURNING id, body, created_at, updated_at`,
    [trimmed, reviewId],
  );
  return rows[0] ?? null;
}

export async function deleteReview(reviewId) {
  await query(`DELETE FROM product_reviews WHERE id = $1`, [reviewId]);
}

export async function adjustThumbsUp(reviewId, delta) {
  const { rows } = await query(
    `UPDATE product_reviews
        SET thumbs_up_count = GREATEST(0, thumbs_up_count + $1)
      WHERE id = $2
      RETURNING thumbs_up_count`,
    [delta, reviewId],
  );
  return rows[0]?.thumbs_up_count ?? null;
}
