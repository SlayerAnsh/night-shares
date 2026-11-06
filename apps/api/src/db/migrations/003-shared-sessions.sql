CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user TEXT NOT NULL CHECK(json_valid(user)), expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
