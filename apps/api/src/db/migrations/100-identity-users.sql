CREATE TABLE identity_users (
  human_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('device', 'orb')),
  wallet_address TEXT NOT NULL
);
