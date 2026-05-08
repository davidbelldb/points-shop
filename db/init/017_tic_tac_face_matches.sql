CREATE TABLE IF NOT EXISTS tic_tac_face_matches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  p1_account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  p2_account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  total_rounds       INTEGER NOT NULL DEFAULT 5,
  rounds_played      INTEGER NOT NULL DEFAULT 0,
  p1_wins            INTEGER NOT NULL DEFAULT 0,
  p2_wins            INTEGER NOT NULL DEFAULT 0,
  draws              INTEGER NOT NULL DEFAULT 0,
  winner_account_id  UUID REFERENCES accounts(id),
  p1_points_awarded  INTEGER NOT NULL DEFAULT 0,
  p2_points_awarded  INTEGER NOT NULL DEFAULT 0,
  finished_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tic_tac_face_games
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES tic_tac_face_matches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ttf_match_active ON tic_tac_face_matches (finished_at) WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ttf_match_pair   ON tic_tac_face_matches (p1_account_id, p2_account_id);
