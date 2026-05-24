-- Ducky Derby: admin-editable pre-race intro commentary cycle.
-- Plays in order before betting. {duck} / {duck2} are substituted with racer names.
CREATE TABLE IF NOT EXISTS ducky_intro (
  ord INTEGER PRIMARY KEY CHECK (ord BETWEEN 1 AND 8),
  text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_intro (ord, text, active) VALUES
  (1, 'Welcome along to the Ducky Derby!', TRUE),
  (2, 'It looks like it could be a bread bath out there', TRUE),
  (3, 'We''re hearing there''s been some drama...', TRUE),
  (4, '{duck} has been violating {duck2}', TRUE),
  (5, 'Anyway — pick yourself a duck and place your bet', TRUE),
  (6, '', FALSE), (7, '', FALSE), (8, '', FALSE)
ON CONFLICT (ord) DO NOTHING;
