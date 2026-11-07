CREATE TABLE chain_usdc_wallet_cursors (
  fingerprint TEXT NOT NULL,
  wallet TEXT NOT NULL,
  number INTEGER NOT NULL,
  PRIMARY KEY (fingerprint, wallet)
);
