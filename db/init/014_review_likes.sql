CREATE TABLE IF NOT EXISTS review_likes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id   UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(review_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_review_likes_review ON review_likes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_likes_account ON review_likes(account_id);

INSERT INTO review_likes (review_id, account_id)
  SELECT id, '00000000-0000-0000-0000-000000000001'::uuid
    FROM product_reviews
   WHERE thumbs_up_count > 0
ON CONFLICT (review_id, account_id) DO NOTHING;
