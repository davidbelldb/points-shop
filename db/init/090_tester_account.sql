-- Test account for local/staging use.
-- Password is seeded to "password" automatically by ensureDefaultPasswords()
-- on next backend startup (it seeds any account with a NULL password_hash).

INSERT INTO accounts (username, name, email, role, password_hash)
VALUES ('tester', 'Tester', 'tester@sneakystuff.local', 'customer', NULL)
ON CONFLICT DO NOTHING;
