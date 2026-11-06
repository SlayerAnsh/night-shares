import { expect, test } from "bun:test";
import { nightState, price } from "../index";
import { priceHistory } from "./price-history";

test("history preserves deterministic seeds, 31 points and current endpoints", () => {
  const state = nightState({
    property: {
      id: "velana",
      base: 300,
      phase: 0,
      rooms: 20,
      roomTypes: [{ rateMultiplier: 1 }],
    },
    roomIndex: 0,
    date: "2026-12-24",
    today: "2026-12-01",
  });
  const history = priceHistory("velana", 0, "2026-12-24", state);
  expect(history.fair).toHaveLength(31);
  expect(history.market).toHaveLength(31);
  expect(history.fair[0]).toBeCloseTo(765.3153109127244, 9);
  expect(history.market[0]).toBeCloseTo(807.7038200477256, 9);
  expect(history.fair[30]).toBe(state.pstar);
  expect(history.market[30]).toBe(price(state.F, state.k, state.S, state.q));
  expect(priceHistory("velana", 0, "2026-12-24", state)).toEqual(history);
  expect(priceHistory("velana", 1, "2026-12-24", state)).not.toEqual(history);
});
