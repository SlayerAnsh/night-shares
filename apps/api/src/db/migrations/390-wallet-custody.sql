CREATE TABLE wallet_custody (
  owner TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'privy')),
  wallet_id TEXT NOT NULL,
  address TEXT NOT NULL,
  PRIMARY KEY (owner, provider),
  UNIQUE (provider, wallet_id),
  UNIQUE (provider, address)
);
