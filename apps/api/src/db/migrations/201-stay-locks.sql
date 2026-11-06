CREATE TABLE stay_locks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
  busy INTEGER NOT NULL, trip_id TEXT, snapshot TEXT NOT NULL
);
CREATE INDEX stay_locks_expiry ON stay_locks(expires_at);
