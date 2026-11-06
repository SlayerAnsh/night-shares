CREATE TABLE wallet_balances (address TEXT PRIMARY KEY, balance_micros INTEGER NOT NULL CHECK(typeof(balance_micros) = 'integer' AND balance_micros >= 0));
CREATE TABLE wallet_transactions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at INTEGER NOT NULL, from_address TEXT NOT NULL REFERENCES wallet_balances(address), to_address TEXT NOT NULL REFERENCES wallet_balances(address), amount_micros INTEGER NOT NULL CHECK(typeof(amount_micros) = 'integer' AND amount_micros > 0), memo TEXT NOT NULL);
CREATE INDEX wallet_transactions_from ON wallet_transactions(from_address, at);
CREATE INDEX wallet_transactions_to ON wallet_transactions(to_address, at);
