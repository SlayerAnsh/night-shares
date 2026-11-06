import { expect, test } from "bun:test";
import { coverLegs } from "./cover-legs";

test("waterfall uses reserve then pending then cover and charges unpaid penalty as debt", () => {
  const result = coverLegs(100n, 30n, 20n, "holder");
  expect(result.legs.map((leg) => [leg.from, leg.amount])).toEqual([
    ["pool", 30n],
    ["pool", 20n],
    ["cover_fund", 50n],
  ]);
  expect(result.debt).toBe(150n);
});
test("pending funds pay the penalty after holder cover", () => {
  const result = coverLegs(100n, 30n, 200n, "holder");
  expect(result.pending).toBe(170n);
  expect(result.debt).toBe(0n);
  expect(result.legs.at(-1)).toMatchObject({ to: "cover_fund", amount: 100n });
});

test("unsafe model amounts reject before money is converted", () => {
  expect(() =>
    coverLegs(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 0n, 0n, "holder"),
  ).toThrow(RangeError);
});
