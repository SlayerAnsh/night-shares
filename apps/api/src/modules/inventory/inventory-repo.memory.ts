import type { Clock } from "../../ports/clock/clock";
import { DomainError } from "../../shared/errors/domain-error";
import { format, parse } from "../../shared/night-key";
import type { CatalogRepo } from "../catalog-data/catalog-repo";
import type { InventoryRepo, NightRecord } from "./inventory-repo";
import { seedNight } from "./seed-night";
import { wholeQuantities } from "./whole-quantities";
export function createMemoryInventoryRepo(deps: {
  catalog: CatalogRepo;
  clock: Clock;
}): InventoryRepo {
  const records = new Map<string, NightRecord>();
  const repo: InventoryRepo = {
    get(key) {
      return repo.seedNight(parse(key));
    },
    seedNight(night) {
      const key = format(night);
      let record = records.get(key);
      if (!record) {
        record = wholeQuantities(seedNight(deps, night));
        records.set(key, record);
      }
      return structuredClone(record);
    },
    update(key, mutate) {
      const record = mutate(repo.get(key));
      if (record.key !== key)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Cannot change the night key during an update.",
        );
      repo.save(record);
      return structuredClone(record);
    },
    save(record) {
      record = wholeQuantities(record);
      if (format(record) !== record.key)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Night key does not match the record.",
        );
      if (!records.has(record.key))
        throw new DomainError("NOT_FOUND", "Seed the night before saving it.");
      records.set(record.key, structuredClone(record));
    },
    list(filter = {}) {
      return structuredClone(
        [...records.values()].filter(
          (r) =>
            (!filter.propertyId || r.propertyId === filter.propertyId) &&
            (!filter.roomTypeId || r.roomTypeId === filter.roomTypeId) &&
            (!filter.start || r.date >= filter.start) &&
            (!filter.end || r.date < filter.end),
        ),
      );
    },
  };
  return repo;
}
