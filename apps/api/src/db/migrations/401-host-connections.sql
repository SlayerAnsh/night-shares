CREATE TABLE host_connections (
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  pms TEXT NOT NULL,
  PRIMARY KEY (user_id, property_id)
);
CREATE TABLE host_room_types (
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  record TEXT NOT NULL,
  usual_rate_micros INTEGER,
  PRIMARY KEY (user_id, property_id, position),
  FOREIGN KEY (user_id, property_id) REFERENCES host_connections ON DELETE CASCADE
);
