-- Ducky Derby: expand banner slots from 6 to 12 for more course messages.
ALTER TABLE ducky_banners DROP CONSTRAINT IF EXISTS ducky_banners_ord_check;
ALTER TABLE ducky_banners ADD CONSTRAINT ducky_banners_ord_check CHECK (ord BETWEEN 1 AND 12);

INSERT INTO ducky_banners (ord, text, active) VALUES
  (7, '', FALSE), (8, '', FALSE), (9, '', FALSE),
  (10, '', FALSE), (11, '', FALSE), (12, '', FALSE)
ON CONFLICT (ord) DO NOTHING;
