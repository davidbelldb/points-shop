import { query } from '../../db.js';

export async function listReviewsForProduct(productId) {
  const { rows } = await query(
    `SELECT r.id, r.body, r.created_at, r.updated_at,
            a.id AS account_id, a.name AS account_name, a.username AS account_username, a.photo_url AS account_photo,
            COALESCE(
              (SELECT json_agg(
                json_build_object('id', la.id, 'username', la.username, 'name', la.name, 'photo_url', la.photo_url)
                ORDER BY rl.created_at
              )
              FROM review_likes rl
              JOIN accounts la ON la.id = rl.account_id
              WHERE rl.review_id = r.id),
              '[]'::json
            ) AS liked_by
       FROM product_reviews r
       JOIN accounts a ON a.id = r.account_id
      WHERE r.product_id = $1
      ORDER BY r.created_at DESC`,
    [productId],
  );
  return rows;
}

export async function createReview(accountId, productId, body) {
  const trimmed = body.trim();
  if (!trimmed) {
    const err = new Error('Body required');
    err.statusCode = 400; throw err;
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
    err.statusCode = 400; throw err;
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

export async function addLike(reviewId, accountId) {
  await query(
    `INSERT INTO review_likes (review_id, account_id) VALUES ($1, $2)
     ON CONFLICT (review_id, account_id) DO NOTHING`,
    [reviewId, accountId],
  );
}

export async function removeLike(reviewId, accountId) {
  await query(
    `DELETE FROM review_likes WHERE review_id = $1 AND account_id = $2`,
    [reviewId, accountId],
  );
}
