-- Keep every wallet alias attached to its human when a session changes wallets.
CREATE TABLE market_human_wallets (
  wallet_address TEXT PRIMARY KEY,
  human_id TEXT NOT NULL
);
INSERT INTO market_human_wallets SELECT wallet_address, human_id FROM market_holders;
CREATE INDEX market_human_wallets_human ON market_human_wallets(human_id);
