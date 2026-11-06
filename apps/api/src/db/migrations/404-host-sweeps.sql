CREATE TABLE host_sweeps (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  debt INTEGER NOT NULL,
  at INTEGER NOT NULL,
  transaction_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL
);
CREATE UNIQUE INDEX host_sweep_pending ON host_sweeps(property_id) WHERE status = 'pending';
CREATE TABLE host_pool_positions (
  night_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  minted_tenths INTEGER NOT NULL
);
