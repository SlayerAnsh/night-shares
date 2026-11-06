CREATE TABLE market_agent_orders (
  human_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  record TEXT NOT NULL,
  PRIMARY KEY (human_id, order_id)
);
