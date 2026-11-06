import type { Database, SQLQueryBindings } from "bun:sqlite";
import { transaction } from "../../../db/transaction";
import { createSqliteMap } from "./sqlite-map";
import type { QuoteLock, StayRepo, StoredTrip } from "./stay-repo";

type Row = {
  id: string;
  snapshot: string;
  user_id: string;
  expires_at: bigint;
  busy: bigint;
  trip_id: string | null;
  guest_name: string;
  guest_email: string;
  wallet_address: string;
  paid_at: bigint;
};

export function createSqliteStayRepo(db: Database): StayRepo {
  function collection<T>(
    table: string,
    pack: (value: T) => {
      snapshot: unknown;
      columns?: Record<string, SQLQueryBindings>;
    },
    unpack: (snapshot: unknown, row: Row) => T,
  ): Map<string, T> {
    return createSqliteMap({
      keys: () =>
        db
          .query<{ id: string }, []>(`SELECT id FROM ${table} ORDER BY rowid`)
          .all()
          .map((row) => row.id),
      get(key) {
        const row = db
          .query<Row, [string]>(`SELECT * FROM ${table} WHERE id = ?`)
          .get(key);
        if (!row) return undefined;
        const money = db
          .query<{ slot: bigint; micros: bigint }, [string, string]>(
            "SELECT slot, micros FROM stay_money WHERE collection = ? AND record_id = ?",
          )
          .all(table, key);
        const amounts = new Map(
          money.map((item) => [Number(item.slot), item.micros]),
        );
        const snapshot: unknown = JSON.parse(
          row.snapshot,
          (_key, value: unknown) => {
            if (value && typeof value === "object" && "$stayMoney" in value)
              return amounts.get(Number(value.$stayMoney));
            return value;
          },
        );
        return unpack(snapshot, row);
      },
      set(key, value) {
        transaction(db, () => {
          const packed = pack(value);
          const amounts: bigint[] = [];
          const snapshot = JSON.stringify(
            packed.snapshot,
            (_key, item: unknown) => {
              if (typeof item !== "bigint") return item;
              amounts.push(item);
              return { $stayMoney: amounts.length - 1 };
            },
          );
          const columns = { snapshot, ...packed.columns };
          const names = Object.keys(columns);
          db.query(`INSERT INTO ${table} (id, ${names.join(", ")})
            VALUES (?, ${names.map(() => "?").join(", ")})
            ON CONFLICT(id) DO UPDATE SET ${names.map((name) => `${name} = excluded.${name}`).join(", ")}`).run(
            key,
            ...Object.values(columns),
          );
          db.query(
            "DELETE FROM stay_money WHERE collection = ? AND record_id = ?",
          ).run(table, key);
          for (const [slot, amount] of amounts.entries()) {
            if (amount < -(1n << 63n) || amount >= 1n << 63n)
              throw new RangeError("Stay money exceeds SQLite INTEGER range.");
            db.query("INSERT INTO stay_money VALUES (?, ?, ?, ?)").run(
              table,
              key,
              slot,
              amount,
            );
          }
        });
      },
      delete(key) {
        return transaction(db, () => {
          db.query(
            "DELETE FROM stay_money WHERE collection = ? AND record_id = ?",
          ).run(table, key);
          return (
            db.query(`DELETE FROM ${table} WHERE id = ?`).run(key).changes > 0
          );
        });
      },
    });
  }
  return {
    quotes: collection(
      "stay_quotes",
      (snapshot) => ({ snapshot }),
      (snapshot) => snapshot as QuoteLock["quote"],
    ),
    locks: collection<QuoteLock>(
      "stay_locks",
      (lock) => ({
        snapshot: lock.quote,
        columns: {
          user_id: lock.userId,
          expires_at: lock.expiresAt,
          busy: Number(lock.busy),
          trip_id: lock.tripId ?? null,
        },
      }),
      (snapshot, row) => ({
        id: row.id,
        userId: row.user_id,
        expiresAt: Number(row.expires_at),
        busy: Boolean(row.busy),
        tripId: row.trip_id ?? undefined,
        quote: snapshot as QuoteLock["quote"],
      }),
    ),
    trips: collection<StoredTrip>(
      "stay_trips",
      (saved) => ({
        snapshot: saved.trip,
        columns: {
          user_id: saved.userId,
          guest_name: saved.guestName,
          guest_email: saved.guestEmail,
          wallet_address: saved.walletAddress,
          paid_at: saved.paidAt,
        },
      }),
      (snapshot, row) => ({
        trip: snapshot as StoredTrip["trip"],
        userId: row.user_id,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        walletAddress: row.wallet_address,
        paidAt: Number(row.paid_at),
      }),
    ),
    saves: collection<Set<string>>(
      "stay_saves",
      (value) => ({ snapshot: [...value] }),
      (snapshot) => new Set(snapshot as string[]),
    ),
  };
}
