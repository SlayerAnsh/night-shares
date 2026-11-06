CREATE TABLE market_cutoff_claims (
  night_key TEXT NOT NULL,
  human_id TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  average INTEGER NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0,
  busy INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER,
  PRIMARY KEY (night_key, human_id)
);
