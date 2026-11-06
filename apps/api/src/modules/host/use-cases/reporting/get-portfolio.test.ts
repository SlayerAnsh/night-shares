import { expect, test } from "bun:test";
import { fixture } from "../fixture";

test("demo host sees four connected hotels and eight occupancy weeks", () => {
  const f = fixture(),
    result = f.use.getPortfolio(f.userId);
  expect(result.hotels.map((h) => h.propertyId)).toEqual([
    "prop_velana",
    "prop_ubud",
    "prop_rive",
    "prop_alpen",
  ]);
  expect(result.occupancy).toHaveLength(8);
  expect(result.kpis.availableNow.micros).toBeGreaterThan(0n);
  expect(result.kpis.revenue.micros).toBe(
    result.hotels.reduce((n, h) => n + h.kpis.revenue.micros, 0n),
  );
});

test("hotel and portfolio available now both exclude swept earnings", async () => {
  const f = fixture();
  const { createSweep } = await import("../payout/sweep");
  const address = await f.ports.walletProvider.linkWallet("host");
  const propertyId = "prop_velana";
  const available = f.use.getPayout(f.userId, propertyId).availableNow.micros;
  await createSweep(f)(f.userId, propertyId, address);
  const portfolio = f.use.getPortfolio(f.userId);
  const hotel = f.use.getHotel(f.userId, propertyId, "2026-12");
  expect(hotel.kpis.availableNow.micros).toBe(0n);
  expect(
    portfolio.hotels.find((h) => h.propertyId === propertyId)?.kpis
      .availableNow,
  ).toEqual(hotel.kpis.availableNow);
  expect(f.use.getPayout(f.userId, propertyId).sweptTotal.micros).toBe(
    available,
  );
  f.ports.db.close();
});
