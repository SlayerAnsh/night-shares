CREATE TABLE market_maker_nonces (
  maker TEXT PRIMARY KEY,
  nonce INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE market_signed_asks (
  night_key TEXT NOT NULL,
  maker TEXT NOT NULL,
  human_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  price INTEGER NOT NULL,
  expiry INTEGER NOT NULL,
  nonce INTEGER NOT NULL,
  digest TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  PRIMARY KEY (night_key, maker)
);
CREATE INDEX market_signed_asks_expiry ON market_signed_asks(status, expiry);
