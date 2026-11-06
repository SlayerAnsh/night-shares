CREATE TABLE activity (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at INTEGER NOT NULL, night_key TEXT NOT NULL, property_id TEXT NOT NULL, kind TEXT NOT NULL, tenths INTEGER NOT NULL, price_micros INTEGER, actor TEXT NOT NULL, user_id TEXT);
CREATE INDEX activity_night ON activity(night_key, at);
CREATE INDEX activity_property ON activity(property_id, at);
