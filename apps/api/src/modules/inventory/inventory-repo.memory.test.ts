import { expect, test } from "bun:test";
import { nightState } from "@night-shares/market-model";
import { createMockClock } from "../../ports/clock/clock.mock";
import { parseDate } from "../../shared/dates";
import { createMemoryCatalogRepo } from "../catalog-data/catalog-repo.memory";
import { createMemoryInventoryRepo } from "./inventory-repo.memory";
import { applyPoolBuy } from "./mutations/apply-pool-buy";

test("all six properties seed both room types with original mock pricing ids", () => {
  const clock = createMockClock(parseDate("2026-12-01"));
  const catalog = createMemoryCatalogRepo();
  const inventory = createMemoryInventoryRepo({ clock, catalog });
  expect(catalog.list()).toHaveLength(6);
  expect(inventory.list()).toHaveLength(0);
  for (const property of catalog.list()) {
    for (const [roomIndex, room] of property.roomTypes.entries()) {
      const record = inventory.seedNight({
        propertyId: property.id,
        roomTypeId: room.id,
        date: "2026-12-24",
      });
      expect(record.state).toEqual(
        nightState({
          property: { ...property, id: property.modelId },
          roomIndex,
          date: record.date,
          today: clock.today(),
        }),
      );
    }
  }
  expect(inventory.list()).toHaveLength(12);
  const key = "prop_velana:rt_velana_0:2026-12-24";
  const first = inventory.get(key);
  inventory.save(applyPoolBuy(first, 1));
  clock.advance(86_400_000);
  expect(inventory.get(key).state.q).toBeCloseTo(first.state.q + 0.1);
  first.state.q = -1;
  expect(inventory.get(key).state.q).toBeGreaterThan(0);
  expect(
    inventory.list({
      propertyId: "prop_velana",
      start: "2026-12-24",
      end: "2026-12-25",
    }),
  ).toHaveLength(2);
  expect(() => inventory.get("prop_missing:rt_missing:2026-12-24")).toThrow(
    "Property or room type",
  );
});
