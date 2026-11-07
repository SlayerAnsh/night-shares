-- Chain intents remain pending until a canonical receipt has been projected.
CREATE TABLE market_chain_intents (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  human_id TEXT NOT NULL,
  night_key TEXT NOT NULL,
  command TEXT NOT NULL,
  agent INTEGER NOT NULL DEFAULT 0,
  reserved TEXT NOT NULL DEFAULT '0',
  state TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  request TEXT NOT NULL
);
CREATE UNIQUE INDEX market_chain_pending ON market_chain_intents(fingerprint, wallet_id)
  WHERE state = 'pending';
CREATE TABLE market_chain_asks (
  fingerprint TEXT NOT NULL,
  night_key TEXT NOT NULL,
  maker TEXT NOT NULL,
  human_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  PRIMARY KEY(fingerprint, digest)
);
CREATE TABLE market_chain_positions (
  fingerprint TEXT NOT NULL,
  night_key TEXT NOT NULL,
  wallet TEXT NOT NULL,
  human_id TEXT NOT NULL,
  block_number TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  PRIMARY KEY(fingerprint, night_key, wallet)
);
CREATE TABLE market_chain_cancellations (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  maker TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  target TEXT,
  keep TEXT NOT NULL,
  user TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE UNIQUE INDEX market_chain_cancel_pending ON market_chain_cancellations(fingerprint, maker)
  WHERE state = 'pending';
CREATE TABLE market_chain_approvals (
  fingerprint TEXT NOT NULL,
  order_id TEXT NOT NULL,
  human_id TEXT NOT NULL,
  PRIMARY KEY(fingerprint,order_id)
);
CREATE TABLE market_chain_preparations (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  deadline TEXT NOT NULL,
  amount TEXT NOT NULL,
  request TEXT NOT NULL
);
