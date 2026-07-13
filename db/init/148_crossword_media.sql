-- Optional media tiles plotted onto the crossword's blank space. Each item is
-- { id, type: 'voice'|'photo', url, row, col, words:[wordIndex,...] }. A voice
-- tile occupies 2x2 and links one word; a photo occupies 2x3 (6 cells) and can
-- link up to 6 words that progressively reveal it (mosaic). Words with media
-- get live validation as a bonus.
ALTER TABLE crossword
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]';
