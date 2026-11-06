ALTER TABLE reception_taps ADD COLUMN tag_uid TEXT;
ALTER TABLE reception_taps ADD COLUMN counter INTEGER;
ALTER TABLE walk_reports ADD COLUMN evidence_hash TEXT NOT NULL DEFAULT '';
CREATE TABLE reception_tag_counters (
  tag_uid TEXT PRIMARY KEY,
  counter INTEGER NOT NULL CHECK (counter > 0)
);
CREATE TABLE reception_tag_uses (
  payload TEXT PRIMARY KEY
);
