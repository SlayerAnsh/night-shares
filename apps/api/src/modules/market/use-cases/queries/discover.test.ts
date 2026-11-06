import { expect, test } from "bun:test";
import { DiscoverSort } from "@night-shares/proto/market/v1/analytics_pb";
import { fixture } from "../../testing/fixture";
import { toggleWatch } from "../account/toggle-watch";
import { discover } from "./discover";

const filters = {
  city: "",
  sort: DiscoverSort.RETURN,
  soon: false,
  valueOnly: false,
  watchlist: false,
};
test("discover covers 75 nights across every room type deterministically", async () => {
  const d = await fixture();
  const result = discover(d, filters);
  expect(result.nights).toHaveLength(900);
  expect(discover(d, filters)).toEqual(result);
  expect(result.nights[0]?.estimatedReturnBps).toBeGreaterThanOrEqual(
    result.nights[1]?.estimatedReturnBps ?? 0,
  );
});
test("discover applies city, soon, value, risk and private watch filters", async () => {
  const d = await fixture();
  toggleWatch(d, d.user, d.key);
  expect(
    discover(d, { ...filters, watchlist: true }, d.user).nights,
  ).toHaveLength(1);
  expect(discover(d, { ...filters, watchlist: true }).nights).toHaveLength(0);
  const city = d.ports.catalog.get(d.night.propertyId)?.city ?? "";
  const result = discover(d, {
    ...filters,
    city,
    soon: true,
    valueOnly: true,
    sort: DiscoverSort.RISK,
  });
  for (const n of result.nights) {
    expect(n.city).toBe(city);
    expect((n.night?.date ?? "") <= "2026-12-15").toBe(true);
    expect(
      (n.price?.micros ?? 0n) * 100n <= (n.fairPrice?.micros ?? 0n) * 98n,
    ).toBe(true);
  }
});
