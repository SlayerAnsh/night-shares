CREATE TABLE inventory (night_key TEXT PRIMARY KEY, property_id TEXT NOT NULL, room_type_id TEXT NOT NULL, date TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)));
CREATE INDEX inventory_identity ON inventory(property_id, room_type_id, date);
CREATE INDEX inventory_date ON inventory(date);
