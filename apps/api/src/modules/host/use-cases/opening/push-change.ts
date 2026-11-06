import { Code, ConnectError } from "@connectrpc/connect";
import { transaction } from "../../../../db/transaction";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { HostDeps } from "../deps";
export function pushChange<T>(
  deps: HostDeps,
  keys: string[],
  userId: string,
  change: (publish: (() => void)[]) => T,
): Promise<T> {
  const { ports, repo } = deps;
  const marker = ports.ids.next("hotel_push");
  const publish: (() => void)[] = [];
  const reservation = transaction(ports.db, () => {
    const before = keys.map((key) => {
      const record = ports.inventory.get(key);
      if (
        record.released ||
        ports.db
          .query("SELECT 1 FROM market_settlements WHERE night_key = ?")
          .get(key) ||
        ports.db
          .query("SELECT 1 FROM stay_locks WHERE busy = 1 AND trip_id IS NULL")
          .get()
      )
        throw new DomainError(
          "FAILED_PRECONDITION",
          "This night cannot be changed now.",
        );
      return { record, policy: repo.release(key) };
    });
    const result = change(publish);
    const updates = keys.map((key) => ports.inventory.get(key));
    // Close admission while the hotel confirms this batch.
    for (const key of keys) {
      ports.db
        .query("INSERT INTO market_settlements VALUES (?, ?)")
        .run(`${marker}:${key}`, key);
      ports.inventory.update(key, (record) => ({ ...record, released: true }));
    }
    return { before, result, updates };
  });
  return (async () => {
    try {
      await ports.channelManager.pushInventory(
        reservation.updates.map((record) => ({
          nightKey: record.key,
          allotmentTenths: Math.round(record.state.S * 10),
          stopped: record.stopped,
        })),
      );
    } catch {
      transaction(ports.db, () => {
        for (const { record, policy } of reservation.before) {
          ports.inventory.update(record.key, () => record);
          repo.setRelease(record.key, policy);
          ports.db
            .query("DELETE FROM market_settlements WHERE id = ?")
            .run(`${marker}:${record.key}`);
          ports.activity.append({
            nightKey: record.key,
            propertyId: record.propertyId,
            userId,
            actor: "host",
            kind: "channel_push_failed",
            tenths: 0,
          });
        }
      });
      // UNAVAILABLE is not yet part of the shared DomainError union.
      throw new ConnectError(
        "The hotel system did not confirm. Nothing changed.",
        Code.Unavailable,
      );
    }
    transaction(ports.db, () => {
      for (const record of reservation.updates) {
        ports.inventory.update(record.key, () => record);
        ports.db
          .query("DELETE FROM market_settlements WHERE id = ?")
          .run(`${marker}:${record.key}`);
      }
      for (const event of publish) event();
    });
    return reservation.result;
  })();
}
