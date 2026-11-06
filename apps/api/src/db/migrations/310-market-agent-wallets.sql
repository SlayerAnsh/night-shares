CREATE TABLE market_agent_wallets (
  human_id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE REFERENCES wallet_balances(address),
  total INTEGER NOT NULL DEFAULT 0 CHECK(typeof(total) = 'integer' AND total >= 0),
  per_order INTEGER NOT NULL DEFAULT 0 CHECK(typeof(per_order) = 'integer' AND per_order >= 0),
  spent INTEGER NOT NULL DEFAULT 0 CHECK(typeof(spent) = 'integer' AND spent >= 0),
  allowed TEXT NOT NULL DEFAULT '[]'
);
