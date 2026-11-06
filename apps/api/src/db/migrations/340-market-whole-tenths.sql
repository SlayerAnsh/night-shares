-- SQLite INTEGER affinity alone permits fractional REAL values.
-- Adding checked columns validates existing rows without rebuilding either table.
ALTER TABLE market_positions ADD COLUMN whole_tenths INTEGER NOT NULL DEFAULT 1
  CHECK (typeof(free) = 'integer' AND typeof(escrow) = 'integer');
ALTER TABLE market_signed_asks ADD COLUMN whole_tenths INTEGER NOT NULL DEFAULT 1
  CHECK (typeof(size) = 'integer' AND typeof(remaining) = 'integer');
