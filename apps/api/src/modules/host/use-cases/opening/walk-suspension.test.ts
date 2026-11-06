import { expect, test } from "bun:test";
import { markWalkFalse } from "../../../walk/use-cases/mark-false";
import { fixture } from "../fixture";

test("two valid public incidents suspend openings; false reports do not count", async () => {
  const f = fixture();
  f.ports.inventory.update(f.key, (r) => ({
    ...r,
    openedAt: 0,
    stopped: true,
  }));
  for (const id of ["one", "two"])
    f.ports.db
      .query(
        "INSERT INTO walk_reports (id, booking_id, property_id, human_id, reported_at, status, paid, from_pending, from_fund) VALUES (?, ?, ?, ?, ?, 'done', 100, 100, 100)",
      )
      .run(
        id,
        `bk_${id}`,
        f.selection.propertyId,
        `human_${id}`,
        f.ports.clock.now(),
      );
  expect(() => f.use.openNights(f.userId, f.selection)).toThrow(
    "New openings are suspended after repeated walked guests.",
  );
  expect(
    f.use.getHotel(f.userId, f.selection.propertyId, "2026-12").walkIncidents,
  ).toHaveLength(2);
  expect(
    f.use
      .getPortfolio(f.userId)
      .hotels.find((hotel) => hotel.propertyId === f.selection.propertyId)
      ?.walkIncidents,
  ).toHaveLength(2);
  markWalkFalse(f.ports, "one");
  await f.use.openNights(f.userId, f.selection);
  expect(f.ports.inventory.get(f.key).stopped).toBe(false);
});
