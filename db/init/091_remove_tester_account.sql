-- Remove the tester account (no longer needed — using admin impersonation
-- for cross-device WebRTC testing instead). Safe to run even if 090 was
-- never applied.

DELETE FROM accounts WHERE username = 'tester';
