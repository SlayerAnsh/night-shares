import { expect, test } from "bun:test";
import {
  capOf,
  clampFair,
  cost,
  floorFromRate,
  lastRoomPrice,
  price,
  recallStrike,
  trancheOf,
} from "./curve";

test("flat curves charge floor per night and exponential curves integrate", () => {
  expect(price(100, 0, 4, 2)).toBe(100);
  expect(cost(100, 0, 4, 1, 3)).toBe(200);
  expect(cost(100, 0.6, 4, 0, 2) + cost(100, 0.6, 4, 2, 4)).toBeCloseTo(
    cost(100, 0.6, 4, 0, 4),
    10,
  );
  expect(lastRoomPrice(100, 0.6)).toBe(price(100, 0.6, 4, 4));
  expect(recallStrike(100, 0)).toBe(125);
});
test("floors, caps, tranches and fair bounds retain original rounding", () => {
  expect(floorFromRate(101)).toBe(86);
  expect(capOf(3)).toBe(1);
  expect(capOf(5, false)).toBe(5);
  expect(trancheOf(0)).toBe(1);
  expect(clampFair(1, 100)).toBe(70);
  expect(clampFair(999, 100)).toBe(250);
});

test("recall markup rejects values below five percent and accepts the floor", () => {
  for (const markup of [-1, 0, 0.04]) {
    expect(() => recallStrike(100, 0, markup)).toThrow(
      new RangeError("recall markup m must be at least 5%"),
    );
  }
  expect(recallStrike(100, 0, 0.05)).toBe(105);
  expect(recallStrike(100, 0)).toBe(125);
});
