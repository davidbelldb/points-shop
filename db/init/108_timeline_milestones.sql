-- Relationship Timeline: milestones move from a static frontend data file
-- into the database, so they can be managed (added/edited/reordered/deleted)
-- from the admin "Relationship Timeline" section instead of via code edits.
--
-- location_lat/location_lng/location_label come from a Places API lookup in
-- the admin editor — location_label is the human-readable place name shown
-- alongside the pin (e.g. "Parker's Piece, Cambridge, UK").

CREATE TABLE IF NOT EXISTS timeline_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  date            TEXT NOT NULL,
  display_date    TEXT NOT NULL DEFAULT '',
  title           TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  icon            TEXT NOT NULL DEFAULT 'Heart',
  media           JSONB,
  location_lat    DOUBLE PRECISION,
  location_lng    DOUBLE PRECISION,
  location_label  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_milestones_sort ON timeline_milestones(sort_order, date);

-- One-time seed from the previous frontend/src/data/milestones.js, only if
-- the table is still empty (so this is safe to re-run / won't duplicate
-- rows the admin has since edited or deleted).
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM timeline_milestones) THEN
    INSERT INTO timeline_milestones
      (sort_order, date, display_date, title, description, icon, media, location_lat, location_lng, location_label)
    VALUES
      (10, '2018-05-21', '21 May 2018', $$The Hidden Rooms$$,
       $$"We’ve met before, right? Just bought a flat, me."$$,
       'Home', NULL, NULL, NULL, NULL),

      (20, '2024-10-16', '16 October 2024', $$The Triangle$$,
       $$"Would you like some mango?"$$,
       'Apple', NULL, 52.2053, 0.1218, NULL),

      (30, '2025-12-05', '5 December 2025', $$Parker's Piece$$,
       $$"We met before through Lorenza, right? It’s Katie, right? Katie James!
Don’t tell me. BRB.

Katie James! Which way ya walking home?"$$,
       'MapPin', NULL, 52.1988, 0.1283, NULL),

      (40, '2026-01', 'January 2026', $$The Triangle$$,
       $$Twirl Delivery — TBC
*[Teams]*$$,
       'Truck', NULL, 52.2053, 0.1218, NULL),

      (50, '2026-02-21', '21 February 2026', $$Blinco Grove$$,
       $$"thewrathofyarn waved at you" 👋

*[Add the gif here!]*$$,
       'MessageCircle',
       $${"url": "/images/milestones/blinco-grove-wave.gif", "type": "gif", "alt": "thewrathofyarn waved at you", "size": "md"}$$::jsonb,
       52.1908, 0.139, NULL),

      (60, '2026-03-27', '27 March 2026', $$The Salisbury Arms$$,
       $$"This is definitely not a date but I should probably come and tuck you in... That’s a big TV! Oh, y-you’re being sick, oh no"$$,
       'Tv', NULL, 52.1923, 0.1462, NULL),

      (70, '2026-04-03', '3 April 2026', $$Bar-OH$$,
       $$"Good date, this."$$,
       'Wine', NULL, 52.2025, 0.1297, NULL),

      (80, '2026-04-18', '18 April 2026', $$Al Pomodoro & Tenpin$$,
       $$"A dessert for your main then, yeah?"$$,
       'IceCream', NULL, 52.1929, 0.1336, NULL),

      (90, '2026-05-10', '10 May 2026', $$Leisure Park Travelodge$$,
       $$"Might just be the best 24 hours of 2026 so far…."$$,
       'BedDouble', NULL, 52.1929, 0.1336, NULL);
  END IF;
END
$migration$;
