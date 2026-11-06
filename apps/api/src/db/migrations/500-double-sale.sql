CREATE TABLE double_sale_reports (
  id TEXT PRIMARY KEY,
  night_key TEXT NOT NULL,
  rooms INTEGER NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE host_cover_accounts (
  property_id TEXT PRIMARY KEY,
  spent INTEGER NOT NULL DEFAULT 0,
  debt INTEGER NOT NULL DEFAULT 0
);
