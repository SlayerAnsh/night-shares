CREATE TABLE world_id_requests (
  request_id TEXT PRIMARY KEY,
  context TEXT NOT NULL
);
CREATE TABLE world_id_enrollments (
  nullifier TEXT PRIMARY KEY,
  human_id TEXT NOT NULL,
  level TEXT NOT NULL
);
CREATE TABLE world_id_sessions (
  session_id TEXT PRIMARY KEY,
  human_id TEXT NOT NULL,
  level TEXT NOT NULL
);
CREATE INDEX world_id_sessions_human ON world_id_sessions(human_id);
CREATE TABLE world_id_nullifiers (
  action TEXT NOT NULL,
  nullifier TEXT NOT NULL,
  PRIMARY KEY (action, nullifier)
);

ALTER TABLE verifications ADD COLUMN resource_id TEXT NOT NULL DEFAULT '';
