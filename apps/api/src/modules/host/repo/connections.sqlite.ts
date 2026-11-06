import type { Database } from "bun:sqlite";
import { transaction } from "../../../db/transaction";
import type { Connection } from "./host-repo";

type ImportedRoomType = Connection["roomTypes"][number] & {
  usualRate?: bigint;
};

// The port exposes a mutable Map, so its mutators must write through to SQLite.
export function createSqliteConnections(
  db: Database,
  userId: string,
): Map<string, Connection> {
  function snapshot() {
    return new Map(
      db
        .query<{ property_id: string; pms: string }, [string]>(
          "SELECT property_id, pms FROM host_connections WHERE user_id = ? ORDER BY rowid",
        )
        .all(userId)
        .map((row) => [
          row.property_id,
          {
            pms: row.pms,
            roomTypes: db
              .query<
                { record: string; usual_rate_micros: bigint | null },
                [string, string]
              >(
                "SELECT record, usual_rate_micros FROM host_room_types WHERE user_id = ? AND property_id = ? ORDER BY position",
              )
              .all(userId, row.property_id)
              .map((room) => {
                const value = JSON.parse(room.record) as ImportedRoomType;
                if (room.usual_rate_micros !== null)
                  value.usualRate = room.usual_rate_micros;
                return value;
              }),
          },
        ]),
    );
  }
  return new (class extends Map<string, Connection> {
    override get size() {
      return snapshot().size;
    }
    override get(key: string) {
      return snapshot().get(key);
    }
    override has(key: string) {
      return snapshot().has(key);
    }
    override entries() {
      return snapshot().entries();
    }
    override keys() {
      return snapshot().keys();
    }
    override values() {
      return snapshot().values();
    }
    override [Symbol.iterator]() {
      return this.entries();
    }
    override forEach(
      callback: (
        value: Connection,
        key: string,
        map: Map<string, Connection>,
      ) => void,
      thisArg?: unknown,
    ) {
      for (const [key, value] of this) callback.call(thisArg, value, key, this);
    }
    override set(key: string, value: Connection) {
      transaction(db, () => {
        db.query(
          "INSERT INTO host_connections VALUES (?, ?, ?) ON CONFLICT(user_id, property_id) DO UPDATE SET pms = excluded.pms",
        ).run(userId, key, value.pms);
        db.query(
          "DELETE FROM host_room_types WHERE user_id = ? AND property_id = ?",
        ).run(userId, key);
        value.roomTypes.forEach((room, position) => {
          const { usualRate, ...record } = room as ImportedRoomType;
          db.query("INSERT INTO host_room_types VALUES (?, ?, ?, ?, ?)").run(
            userId,
            key,
            position,
            JSON.stringify(record),
            usualRate ?? null,
          );
        });
      });
      return this;
    }
    override delete(key: string) {
      return (
        db
          .query(
            "DELETE FROM host_connections WHERE user_id = ? AND property_id = ?",
          )
          .run(userId, key).changes > 0
      );
    }
    override clear() {
      db.query("DELETE FROM host_connections WHERE user_id = ?").run(userId);
    }
  })();
}
