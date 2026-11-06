CREATE TABLE identity_requests (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  purpose TEXT NOT NULL,
  user_id TEXT NOT NULL,
  signal TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
