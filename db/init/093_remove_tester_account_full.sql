-- 091 only deleted FROM accounts directly, which fails because several
-- tables reference accounts(id) WITHOUT ON DELETE CASCADE (baskets,
-- orders, points_ledger, notifications, product_reviews, survey_responses,
-- and a few secondary columns on the tic-tac-face / giftsweeper tables).
--
-- This migration cleans up every row that references the tester account
-- (tables with ON DELETE CASCADE are handled automatically once the
-- account row itself is removed) and then deletes the account.
-- Safe to run even if the tester account is already gone (all WHERE
-- clauses resolve to an empty set and DELETEs become no-ops).

BEGIN;

-- Non-cascading direct references to accounts(id)
DELETE FROM points_ledger     WHERE account_id = (SELECT id FROM accounts WHERE username = 'tester');
DELETE FROM baskets           WHERE account_id = (SELECT id FROM accounts WHERE username = 'tester');
DELETE FROM orders            WHERE account_id = (SELECT id FROM accounts WHERE username = 'tester');
DELETE FROM product_reviews   WHERE account_id = (SELECT id FROM accounts WHERE username = 'tester');
DELETE FROM notifications     WHERE account_id = (SELECT id FROM accounts WHERE username = 'tester');
DELETE FROM survey_responses  WHERE account_id = (SELECT id FROM accounts WHERE username = 'tester');

-- Game rows where tester appears in a non-cascading column (turn/winner/etc.)
-- — also covers the cascading p1/p2/initiator/opponent columns so the whole
-- row goes in one go.
DELETE FROM tic_tac_face_games WHERE
  (SELECT id FROM accounts WHERE username = 'tester') IN
  (p1_account_id, p2_account_id, turn_account_id, winner_account_id);

DELETE FROM tic_tac_face_matches WHERE
  (SELECT id FROM accounts WHERE username = 'tester') IN
  (p1_account_id, p2_account_id, winner_account_id);

DELETE FROM giftsweeper_matches WHERE
  (SELECT id FROM accounts WHERE username = 'tester') IN
  (initiator_account_id, opponent_account_id, current_turn_account_id);

-- Finally, the account itself (cascades clean up sessions,
-- push_subscriptions, dirty_wordle_*, notes, game_rewards, etc.)
DELETE FROM accounts WHERE username = 'tester';

COMMIT;
