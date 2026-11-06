CREATE TABLE market_watchlist (
  human_id TEXT NOT NULL,
  night_key TEXT NOT NULL,
  PRIMARY KEY (human_id, night_key)
);
