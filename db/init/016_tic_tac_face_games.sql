CREATE TABLE IF NOT EXISTS tic_tac_face_games (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  p1_account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  p2_account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  board              JSONB NOT NULL DEFAULT '[null,null,null,null,null,null,null,null,null]'::jsonb,
  turn_account_id    UUID NOT NULL REFERENCES accounts(id),
  winner_account_id  UUID REFERENCES accounts(id),
  is_draw            BOOLEAN NOT NULL DEFAULT false,
  finished_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ttf_active ON tic_tac_face_games (finished_at) WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ttf_pair   ON tic_tac_face_games (p1_account_id, p2_account_id);
