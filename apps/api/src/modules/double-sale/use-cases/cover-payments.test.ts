import { expect, test } from "bun:test";
import { coverPayments } from "./cover-payments";

test("all holders receive pending cover before any penalty consumes pending funds", () => {
  const cover = coverPayments(
    [
      { to: "a", amount: 100n },
      { to: "b", amount: 100n },
    ],
    0n,
    200n,
  );
  expect(cover.legs).toHaveLength(2);
  expect(cover.legs.every((leg) => leg.from === "pool")).toBe(true);
  expect(cover.debt).toBe(200n);
});
