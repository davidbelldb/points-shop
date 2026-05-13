CREATE TABLE IF NOT EXISTS shut_the_box_games (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  result          TEXT,
  final_tiles_open INTEGER[]
);
CREATE TABLE IF NOT EXISTS dice_trophies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  game_id     UUID REFERENCES shut_the_box_games(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stb_account_started ON shut_the_box_games (account_id, started_at);
CREATE INDEX IF NOT EXISTS idx_trophies_account ON dice_trophies (account_id, created_at);
