CREATE TABLE chain_instances (
  fingerprint TEXT PRIMARY KEY, deployment TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE chain_operations (
  id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload_hash TEXT NOT NULL,
  command TEXT NOT NULL, wallet_id TEXT NOT NULL, sender TEXT NOT NULL,
  state TEXT NOT NULL, nonce INTEGER, calldata TEXT NOT NULL, destination TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '0', envelope TEXT, signed_payload TEXT, tx_hash TEXT,
  receipt TEXT, block_number INTEGER, block_hash TEXT, replaces TEXT,
  UNIQUE(fingerprint, sender, nonce)
);
CREATE TABLE chain_blocks (
  fingerprint TEXT NOT NULL, number INTEGER NOT NULL, hash TEXT NOT NULL,
  PRIMARY KEY(fingerprint, number)
);
CREATE TABLE chain_events (
  fingerprint TEXT NOT NULL, block_number INTEGER NOT NULL, block_hash TEXT NOT NULL,
  tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, address TEXT NOT NULL,
  event TEXT NOT NULL, args TEXT NOT NULL,
  PRIMARY KEY(fingerprint, block_hash, tx_hash, log_index)
);
CREATE TABLE chain_snapshots (
  fingerprint TEXT NOT NULL, key TEXT NOT NULL, block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY(fingerprint, key)
);
CREATE TABLE chain_watches (
  fingerprint TEXT NOT NULL, key TEXT NOT NULL, request TEXT NOT NULL,
  PRIMARY KEY(fingerprint, key)
);
CREATE TABLE chain_provisioning (
  fingerprint TEXT NOT NULL, wallet_id TEXT NOT NULL, native_ready INTEGER NOT NULL DEFAULT 0,
  token_ready INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(fingerprint, wallet_id)
);
