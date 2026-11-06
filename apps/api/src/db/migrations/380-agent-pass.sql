CREATE TABLE agent_pass_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'cancelled', 'expired', 'used')),
  expires_at INTEGER NOT NULL,
  record TEXT NOT NULL
);
CREATE INDEX agent_pass_orders ON agent_pass_attempts(user_id, order_id);
CREATE TABLE agent_pass_links (
  user_id TEXT PRIMARY KEY,
  iss TEXT NOT NULL,
  sub TEXT NOT NULL,
  UNIQUE(iss, sub)
);
