ALTER TABLE walk_reports ADD COLUMN guest_id TEXT NOT NULL DEFAULT '';
UPDATE walk_reports SET guest_id = human_id;
ALTER TABLE walk_reports ADD COLUMN owed_to_guest INTEGER NOT NULL DEFAULT 0 CHECK (owed_to_guest >= 0);
ALTER TABLE walk_reports ADD COLUMN owed_paid INTEGER NOT NULL DEFAULT 0 CHECK (owed_paid >= 0 AND owed_paid <= owed_to_guest);
-- Both namespaces use the same enrollment nullifier in this API. A generated
-- column preserves legacy three-value inserts while making guest_id explicit.
ALTER TABLE walk_bans ADD COLUMN guest_id TEXT GENERATED ALWAYS AS (human_id) VIRTUAL;
CREATE INDEX walk_ban_guest ON walk_bans(guest_id);
CREATE TABLE host_sweep_nights (
  sweep_id TEXT NOT NULL REFERENCES host_sweeps(id) ON DELETE CASCADE,
  night_key TEXT NOT NULL,
  earned INTEGER NOT NULL,
  walk_spent INTEGER NOT NULL,
  PRIMARY KEY (sweep_id, night_key)
);
CREATE INDEX host_sweep_night ON host_sweep_nights(night_key);
-- Cutoff guest payments consume earnings without becoming host withdrawals.
CREATE TABLE walk_cutoff_spent (
  night_key TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount >= 0)
);
-- A reservation serializes payouts to claims across sweeps and cutoff release.
CREATE TABLE walk_claim_locks (property_id TEXT PRIMARY KEY);
CREATE TABLE walk_fund_lock (id INTEGER PRIMARY KEY CHECK (id = 1));
