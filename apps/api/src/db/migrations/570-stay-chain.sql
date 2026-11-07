CREATE TABLE stay_chain_bookings (
  lock_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  trip_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  command TEXT,
  state TEXT NOT NULL DEFAULT 'reserved',
  chain_booking_id TEXT,
  paid INTEGER,
  tx_hash TEXT,
  pms_synced INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE stay_chain_walks (
  booking_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  report_id TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved',
  tx_hash TEXT,
  host TEXT,
  host_debt TEXT,
  incidents TEXT,
  credit TEXT
);
CREATE TABLE stay_chain_guest_links (
  operation_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
