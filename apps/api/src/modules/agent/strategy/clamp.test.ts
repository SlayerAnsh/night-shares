import { expect, test } from "bun:test";
import { clampStrategy } from "./clamp";
import { parseStrategy } from "./schema";
import { AGENT_TEMPLATES } from "./templates";

const a = { propertyId: "prop_1", roomTypeId: "rt_1", date: "2026-11-20" };
const b = { ...a, date: "2026-11-21" };
const key = (n: typeof a) => `${n.propertyId}:${n.roomTypeId}:${n.date}`;
const limits = {
  allowedNights: [key(a)],
  capTenths: 3,
  perOrderCap: 10_000_000n,
};
const valid = () => structuredClone(AGENT_TEMPLATES["buy-the-dip"].strategy);

test("clamp never widens markets beyond the allowlist", () => {
  const s = valid();
  expect(clampStrategy(s, limits).markets.nights).toEqual([a]);
  s.markets.nights = [a, b];
  s.markets.propertyIds = ["prop_1"];
  s.markets.disabled = [a];
  const result = clampStrategy(s, limits);
  expect(result.markets).toEqual({ ...s.markets, nights: [a] });
  expect(s.markets.nights).toEqual([a, b]);
  expect(clampStrategy(s, { ...limits, allowedNights: [] }).markets).toEqual(
    s.markets,
  );
});

test("disjoint markets remain disabled instead of becoming a wildcard", () => {
  const s = valid();
  s.markets.nights = [b];
  const result = clampStrategy(s, limits);
  expect(result.markets.nights).toEqual([b]);
  expect(result.markets.disabled).toContainEqual(b);
  expect(parseStrategy(result)).toEqual(result);
});

test("clamp caps per night size at the human cap", () => {
  expect(clampStrategy(valid(), limits).sizing).toEqual({
    maxPerNight: 3,
    maxPerTrade: 3,
  });
  expect(clampStrategy(valid(), { ...limits, capTenths: 100 }).sizing).toEqual(
    valid().sizing,
  );
});

test("clamp is idempotent", () => {
  for (const nights of [[], [a], [b], [a, b]]) {
    const s = valid();
    s.markets.nights = nights;
    const result = clampStrategy(s, limits);
    expect(clampStrategy(result, limits)).toEqual(result);
  }
});

test("clamp rejects invalid limits and leaves quoted money enforcement to executor", () => {
  for (const capTenths of [0, -1, 1.5, Infinity]) {
    expect(() => clampStrategy(valid(), { ...limits, capTenths })).toThrow();
  }
  expect(() =>
    clampStrategy(valid(), { ...limits, perOrderCap: -1n }),
  ).toThrow();
  expect(clampStrategy(valid(), { ...limits, perOrderCap: 0n }).sizing).toEqual(
    { maxPerNight: 3, maxPerTrade: 3 },
  );
});
