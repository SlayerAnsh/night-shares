import { expect, test } from "bun:test";
import { cost, hostPayout, price } from "../src/index";
import { compare } from "./compare";
import { original } from "./original";

test("ladder matches within rooms, at boundaries and across partial final rooms", () => {
  for (const F of [0, 1, 6000])
    for (const k of [0, 0.3, 1.2])
      for (const S of [0.5, 1, 2.5, 15]) {
        const points = [0, 0.1, S / 2, S - 0.1, S];
        for (const q of [...points, -0.1, S + 0.1])
          compare(price(F, k, S, q), original.price(F, k, S, q));
        for (const a of points)
          for (const b of points)
            compare(cost(F, k, S, a, b), original.cost(F, k, S, a, b));
      }
});

test("frozen ladder example preserves costs and host reserve split", () => {
  expect(cost(6000, 1.2, 15, 6, 7)).toBe(10092.16589819334);
  expect(cost(6000, 1.2, 15, 0, 15)).toBe(173962.37552709514);
  expect(price(6000, 1.2, 15, 15)).toBeCloseTo(19920.7, 2);
  expect(hostPayout({ F: 6000, k: 1.2, S: 15, q: 6, held: 4 })).toEqual({
    gross: 46193.260976046266,
    availableNow: 13009.845754630565,
    heldForTraders: 33183.4152214157,
  });
});
