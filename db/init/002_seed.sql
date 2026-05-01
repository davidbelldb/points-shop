INSERT INTO accounts (id, name, email, photo_url, points_balance)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Katie',
  'katie@example.com',
  NULL,
  1000
);

INSERT INTO points_ledger (account_id, delta, reason)
VALUES ('00000000-0000-0000-0000-000000000001', 1000, 'initial_balance');

INSERT INTO products (id, sku, name, description, price_points, thumbnail_url)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'CINEMA-NIGHT',  'Cinema Night',         'A trip to the cinema with snacks of your choosing.',                    150, NULL),
  ('22222222-2222-2222-2222-222222222222', 'BREAKFAST-BED', 'Breakfast in Bed',     'A full breakfast brought to you in bed, your menu choice.',             80,  NULL),
  ('33333333-3333-3333-3333-333333333333', 'DAY-OFF-CHORES','Day Off From Chores',  'A whole day with no chores expected of you.',                           120, NULL);

INSERT INTO inventory (product_id, stock_qty, lead_time_days)
VALUES
  ('11111111-1111-1111-1111-111111111111', 5, 1),
  ('22222222-2222-2222-2222-222222222222', 10, 0),
  ('33333333-3333-3333-3333-333333333333', 3, 7);
