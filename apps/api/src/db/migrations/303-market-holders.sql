CREATE TABLE market_holders (
  human_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  wallet_address TEXT NOT NULL
);
INSERT INTO market_holders SELECT human_id, id, wallet_address FROM identity_users;
