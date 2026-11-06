CREATE TABLE verifications (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0, 1)));
CREATE INDEX verifications_expiry ON verifications(expires_at);
