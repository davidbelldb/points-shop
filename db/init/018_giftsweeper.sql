CREATE TABLE IF NOT EXISTS giftsweeper_matches (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  opponent_account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  grid_rows                INTEGER NOT NULL DEFAULT 6,
  grid_cols                INTEGER NOT NULL DEFAULT 6,
  cost_per_cell            INTEGER NOT NULL DEFAULT 1,
  initiator_setup_done     BOOLEAN NOT NULL DEFAULT FALSE,
  opponent_setup_done      BOOLEAN NOT NULL DEFAULT FALSE,
  current_turn_account_id  UUID REFERENCES accounts(id),
  finished_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS giftsweeper_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          UUID NOT NULL REFERENCES giftsweeper_matches(id) ON DELETE CASCADE,
  owner_account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES products(id),
  text_label        TEXT,
  cells             JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS giftsweeper_guesses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            UUID NOT NULL REFERENCES giftsweeper_matches(id) ON DELETE CASCADE,
  guesser_account_id  UUID NOT NULL REFERENCES accounts(id),
  cell_row            INTEGER NOT NULL,
  cell_col            INTEGER NOT NULL,
  hit_item_id         UUID REFERENCES giftsweeper_items(id),
  turn_number         INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, guesser_account_id, cell_row, cell_col)
);
CREATE TABLE IF NOT EXISTS game_rewards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_type   TEXT NOT NULL,
  source_id     UUID,
  product_id    UUID REFERENCES products(id),
  text_label    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  claimed_at    TIMESTAMPTZ,
  order_id      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gs_match_active  ON giftsweeper_matches (finished_at) WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gs_match_pair    ON giftsweeper_matches (initiator_account_id, opponent_account_id);
CREATE INDEX IF NOT EXISTS idx_gs_items_match   ON giftsweeper_items (match_id, owner_account_id);
CREATE INDEX IF NOT EXISTS idx_gs_guesses_match ON giftsweeper_guesses (match_id, guesser_account_id);
CREATE INDEX IF NOT EXISTS idx_game_rewards_acc ON game_rewards (account_id, status);
