import type { Database } from "bun:sqlite";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { ActivityEvent, ActivityLog } from "./activity-log";

type Row = Omit<ActivityEvent, "at" | "tenths" | "priceMicros" | "userId"> & {
  at: bigint;
  tenths: bigint;
  priceMicros: bigint | null;
  userId: string | null;
};
export function createSqliteActivityLog({
  db,
  clock,
  ids,
}: {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
}): ActivityLog {
  return {
    append(input) {
      const event = { ...input, id: ids.next("act"), at: clock.now() };
      db.query(
        "INSERT INTO activity (id, at, night_key, property_id, kind, tenths, price_micros, actor, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        event.id,
        event.at,
        event.nightKey,
        event.propertyId,
        event.kind,
        event.tenths,
        event.priceMicros ?? null,
        event.actor,
        event.userId ?? null,
      );
      return event;
    },
    list(filter) {
      return db
        .query<
          Row,
          [string | null, string | null, string | null, number]
        >(`SELECT id, at, night_key AS nightKey, property_id AS propertyId, kind, tenths, price_micros AS priceMicros, actor, user_id AS userId FROM activity WHERE
        (?1 IS NULL OR night_key = ?1) AND (?2 IS NULL OR property_id = ?2)
        AND (?3 IS NULL OR kind IN (SELECT value FROM json_each(?3))) ORDER BY at DESC, sequence DESC LIMIT ?4`)
        .all(
          filter.nightKey ?? null,
          filter.propertyId ?? null,
          filter.kinds === undefined ? null : JSON.stringify(filter.kinds),
          filter.limit === undefined ? -1 : Math.max(0, filter.limit),
        )
        .map((row) => ({
          ...row,
          at: Number(row.at),
          tenths: Number(row.tenths),
          priceMicros: row.priceMicros ?? undefined,
          userId: row.userId ?? undefined,
        }));
    },
  };
}
