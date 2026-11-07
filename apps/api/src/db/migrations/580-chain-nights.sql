CREATE TABLE chain_nights (
  fingerprint TEXT NOT NULL, night TEXT NOT NULL, token TEXT NOT NULL,
  block_number INTEGER NOT NULL, block_hash TEXT NOT NULL,
  PRIMARY KEY (fingerprint, night)
);
CREATE TABLE chain_night_keys (
  night TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE
);
CREATE TABLE chain_market_snapshots (
  fingerprint TEXT NOT NULL, night TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY (fingerprint, night)
);
INSERT OR IGNORE INTO chain_nights
SELECT fingerprint, json_extract(args, '$.night'), json_extract(args, '$.token'), block_number, block_hash
FROM chain_events WHERE event = 'NightOpened';
CREATE INDEX chain_events_token_transfers ON chain_events(fingerprint, lower(address), event, block_number, log_index);
