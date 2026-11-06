import type { Database } from "bun:sqlite";
import { fromJsonString, toJsonString } from "@bufbuild/protobuf";
import {
  type AgentOrder,
  AgentOrderSchema,
} from "@night-shares/proto/market/v1/portfolio_pb";
import { sqliteMap } from "./sqlite-map";

export function sqliteAgentOrders(
  db: Database,
  id: string,
): Map<string, AgentOrder> {
  return sqliteMap({
    read: () =>
      new Map(
        db
          .query<{ order_id: string; record: string }, [string]>(
            "SELECT order_id, record FROM market_agent_orders WHERE human_id = ? ORDER BY rowid",
          )
          .all(id)
          .map((row) => [
            row.order_id,
            fromJsonString(AgentOrderSchema, row.record),
          ]),
      ),
    write(key, order) {
      db.query(
        "INSERT INTO market_agent_orders VALUES (?, ?, ?) ON CONFLICT (human_id, order_id) DO UPDATE SET record = excluded.record",
      ).run(id, key, toJsonString(AgentOrderSchema, order));
    },
    remove: (key) =>
      db
        .query(
          "DELETE FROM market_agent_orders WHERE human_id = ? AND order_id = ?",
        )
        .run(id, key).changes > 0,
    clear() {
      db.query("DELETE FROM market_agent_orders WHERE human_id = ?").run(id);
    },
  });
}
