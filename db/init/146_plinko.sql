-- Plinko — a staked prize-drop game.
-- Drop a chip (costs points) through a peg field; it lands in an admin-configured
-- bottom slot that awards a prize (a product or a free-text "experience").
-- The landing slot + settlement are decided SERVER-SIDE (weighted, atomic) so the
-- physics can never be tampered with to force a win. Wins land in game_rewards.

-- Singleton settings row (id is pinned to 1).
CREATE TABLE IF NOT EXISTS plinko_settings (
  id             INTEGER     PRIMARY KEY DEFAULT 1,
  cost_per_play  INTEGER     NOT NULL DEFAULT 100,
  peg_rows       INTEGER     NOT NULL DEFAULT 12,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plinko_settings_singleton CHECK (id = 1)
);
INSERT INTO plinko_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- One row per bottom slot (0-based, left → right). prize_kind:
--   'none'       — a blank; landing here wins nothing (stake is still spent)
--   'product'    — awards products.id (via game_rewards.product_id)
--   'experience' — awards a free-text experience (via game_rewards.text_label)
-- weight = relative landing probability (server's weighted pick; lets David make
-- the good prizes rare). label = short caption shown on the slot bar.
CREATE TABLE IF NOT EXISTS plinko_slots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_index  INTEGER     NOT NULL,
  prize_kind  TEXT        NOT NULL DEFAULT 'none',
  product_id  UUID        REFERENCES products(id) ON DELETE SET NULL,
  text_label  TEXT,
  label       TEXT,
  weight      INTEGER     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slot_index)
);
