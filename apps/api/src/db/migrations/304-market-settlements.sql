CREATE TABLE market_settlements (
  id TEXT PRIMARY KEY,
  night_key TEXT NOT NULL
);
CREATE INDEX market_settlements_night ON market_settlements(night_key);
