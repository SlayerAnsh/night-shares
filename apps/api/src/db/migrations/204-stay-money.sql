CREATE TABLE stay_money (
  collection TEXT NOT NULL, record_id TEXT NOT NULL, slot INTEGER NOT NULL,
  micros INTEGER NOT NULL, PRIMARY KEY (collection, record_id, slot)
);
