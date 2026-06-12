-- Sessions accumulate one row per login and were never pruned — only an
-- explicit logout deleted a row. A background job now runs hourly to
-- DELETE FROM sessions WHERE expires_at < NOW(); this index makes that
-- cleanup (and any other expiry-based lookups) cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
