import type { Database } from "bun:sqlite";
import { transaction } from "../../db/transaction";
import type { Clock } from "../../ports/clock/clock";
import { DomainError } from "../../shared/errors/domain-error";
import { format, parse } from "../../shared/night-key";
import type { CatalogRepo } from "../catalog-data/catalog-repo";
import { chainDraft } from "./chain-draft";
import type { InventoryRepo, NightRecord } from "./inventory-repo";
import { seedNight } from "./seed-night";
import { wholeQuantities } from "./whole-quantities";
export function createSqliteInventoryRepo(deps: {
  db: Database;
  catalog: CatalogRepo;
  clock: Clock;
}): InventoryRepo {
  const { db } = deps;
  const repo: InventoryRepo = {
    get(key) {
      return repo.seedNight(parse(key));
    },
    seedNight(night) {
      return transaction(db, () => {
        const key = format(night);
        const row = db
          .query<{ record: string }, [string]>(
            "SELECT record FROM inventory WHERE night_key = ?",
          )
          .get(key);
        if (row) {
          const record = wholeQuantities(
            chainDraft(db, JSON.parse(row.record) as NightRecord),
          );
          db.query("UPDATE inventory SET record = ? WHERE night_key = ?").run(
            JSON.stringify(record),
            key,
          );
          return record;
        }
        const record = wholeQuantities(chainDraft(db, seedNight(deps, night)));
        db.query("INSERT INTO inventory VALUES (?, ?, ?, ?, ?)").run(
          key,
          night.propertyId,
          night.roomTypeId,
          night.date,
          JSON.stringify(record),
        );
        return record;
      });
    },
    update(key, mutate) {
      return transaction(db, () => {
        const record = mutate(repo.get(key));
        if (record.key !== key)
          throw new DomainError(
            "INVALID_ARGUMENT",
            "Cannot change the night key during an update.",
          );
        repo.save(record);
        return structuredClone(record);
      });
    },
    save(record) {
      record = wholeQuantities(record);
      if (format(record) !== record.key)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Night key does not match the record.",
        );
      const result = db
        .query("UPDATE inventory SET record = ? WHERE night_key = ?")
        .run(JSON.stringify(record), record.key);
      if (!result.changes)
        throw new DomainError("NOT_FOUND", "Seed the night before saving it.");
    },
    list(filter = {}) {
      return db
        .query<
          { record: string },
          [string | null, string | null, string | null, string | null]
        >(`SELECT record FROM inventory WHERE
        (?1 IS NULL OR property_id = ?1) AND (?2 IS NULL OR room_type_id = ?2)
        AND (?3 IS NULL OR date >= ?3) AND (?4 IS NULL OR date < ?4) ORDER BY rowid`)
        .all(
          filter.propertyId || null,
          filter.roomTypeId || null,
          filter.start || null,
          filter.end || null,
        )
        .map((row) =>
          wholeQuantities(
            chainDraft(db, JSON.parse(row.record) as NightRecord),
          ),
        );
    },
  };
  return repo;
}
