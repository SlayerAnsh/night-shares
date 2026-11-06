CREATE TABLE stay_trips (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL, wallet_address TEXT NOT NULL, paid_at INTEGER NOT NULL,
  snapshot TEXT NOT NULL
);
CREATE INDEX stay_trips_owner ON stay_trips(user_id);
