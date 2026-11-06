CREATE TABLE reception_taps (
  booking_id TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL,
  tapped_at INTEGER NOT NULL
);
CREATE TABLE walk_reports (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  property_id TEXT NOT NULL,
  human_id TEXT NOT NULL,
  reported_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'false')),
  paid INTEGER NOT NULL,
  from_pending INTEGER NOT NULL,
  from_fund INTEGER NOT NULL
);
CREATE INDEX walk_property ON walk_reports(property_id, status);
CREATE TABLE walk_bans (
  human_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  banned_at INTEGER NOT NULL
);
