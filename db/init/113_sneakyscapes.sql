-- Sneakyscapes — the garden planner layout.
-- One physical garden ("Katie's"), shared by both accounts (same trust model as
-- shared notes / spreadsheets), so it syncs across every device and both users.
-- Singleton table: exactly one row (id = 1) holding the full placements array as
-- JSONB. Each placement = { id, itemKey, zone, rowIndex, col, anchorKey }.
CREATE TABLE IF NOT EXISTS sneakyscapes_garden (
  id          INTEGER     PRIMARY KEY DEFAULT 1,
  placements  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_by  INTEGER     REFERENCES accounts(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sneakyscapes_singleton CHECK (id = 1)
);

INSERT INTO sneakyscapes_garden (id, placements)
VALUES (1, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
