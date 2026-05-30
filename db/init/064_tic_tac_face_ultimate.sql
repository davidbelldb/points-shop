-- Ultimate Tic-Tac-Face: extend game row with ultimate board state
ALTER TABLE tic_tac_face_games
  ADD COLUMN IF NOT EXISTS local_boards  JSONB,
  ADD COLUMN IF NOT EXISTS global_board  JSONB,
  ADD COLUMN IF NOT EXISTS active_board  INTEGER;
