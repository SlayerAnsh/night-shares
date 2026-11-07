CREATE TABLE identity_chain_ids (
  fingerprint TEXT NOT NULL,
  user_id TEXT NOT NULL,
  human_id TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  PRIMARY KEY (fingerprint, user_id)
);
CREATE TABLE host_chain_intents (
  id TEXT PRIMARY KEY,
  request TEXT NOT NULL
);
CREATE TABLE host_chain_bindings (
  fingerprint TEXT NOT NULL,
  property_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payout TEXT NOT NULL,
  PRIMARY KEY (fingerprint, property_id)
);
CREATE TABLE host_chain_openings (
  fingerprint TEXT NOT NULL,
  night_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  PRIMARY KEY (fingerprint, night_key)
);
CREATE TABLE host_chain_sweeps (
  operation_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  night_key TEXT NOT NULL
);
