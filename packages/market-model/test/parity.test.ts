import { expect, test } from "bun:test";
import * as port from "../src/index";
import { compare } from "./compare";
import { modelSha, original, propertyOf, shared, TODAY } from "./original";

const dates = Array.from({ length: 60 }, (_, i) =>
  new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10),
);

test("original model fingerprint and all exported constants match", () => {
  expect(modelSha.slice(0, 12)).toBe("4bdc16badf85");
  expect(shared.props).toHaveLength(6);
  expect(shared.today.getFullYear()).toBe(2026);
  expect(shared.today.getMonth()).toBe(11);
  expect(shared.today.getDate()).toBe(1);
  for (const key of Object.keys(original) as (keyof typeof original)[]) {
    expect(key in port).toBe(true);
    // biome-ignore lint/performance/noDynamicNamespaceImportAccess: Verify every original export.
    if (typeof original[key] !== "function") compare(port[key], original[key]);
  }
});

for (const property of shared.props) {
  test(`${property.id}: both room types across 60 dates match original market outputs`, () => {
    expect(property.rooms_types).toHaveLength(2);
    for (const roomIndex of [0, 1])
      for (const date of dates) {
        const state = port.nightState({
          property: propertyOf(property),
          roomIndex,
          date,
          today: TODAY,
        });
        const reference = original.nightState(
          property,
          roomIndex,
          shared.parse(date),
        );
        compare(state, reference);
        compare(
          port.nightPrice(property, date),
          shared.nightPrice(property, shared.parse(date)),
        );
        const actualBook = port.book(state),
          referenceBook = original.book(reference);
        compare(actualBook, referenceBook);
        for (const amount of [0, 0.1, 1, state.S + 1])
          for (const guest of [false, true]) {
            compare(
              port.routeBuy(actualBook, amount, { guest }),
              original.routeBuy(referenceBook, amount, { guest }),
            );
          }
        compare(port.hostPayout(state), original.hostPayout(reference));
        for (const hours of [-1, 0, 14, 36, 71.9, 72, state.hoursLeft]) {
          compare(port.lateFee(hours), original.lateFee(hours));
        }
        for (const ask of [
          undefined,
          null,
          0,
          state.pstar,
          state.pstar * 1.5,
          state.pstar * 2,
          state.pstar * 3,
        ]) {
          compare(
            port.unsoldRefund(ask, state.pstar),
            original.unsoldRefund(ask, reference.pstar),
          );
        }
      }
  });
}

test("curve, fee and random helpers preserve exact source formulas", () => {
  for (const seed of ["", "velana", "é🌙", "v2alpen12026-12-25"]) {
    compare(port.hash(seed), shared.hash(seed));
    const a = port.rng(port.hash(seed)),
      b = shared.rng(shared.hash(seed));
    for (let i = 0; i < 30; i++) compare(a(), b());
  }
  for (const F of [0, 1, 391])
    for (const k of [0, 0.3, 0.6, 1]) {
      compare(port.price(F, k, 5, 2), original.price(F, k, 5, 2));
      compare(port.cost(F, k, 5, 1, 3), original.cost(F, k, 5, 1, 3));
      compare(port.lastRoomPrice(F, k), original.lastRoomPrice(F, k));
      compare(port.recallStrike(F, k), original.recallStrike(F, k));
      compare(port.recallStrike(F, k, 0.5), original.recallStrike(F, k, 0.5));
      compare(port.floorFromRate(F), original.floorFromRate(F));
      compare(port.offlineSaleRefund(F), original.offlineSaleRefund(F));
      compare(port.clampFair(F, 100), original.clampFair(F, 100));
    }
  for (const S of [0, 1, 3, 8]) {
    compare(port.trancheOf(S), original.trancheOf(S));
    for (const peak of [false, true])
      compare(port.capOf(S, peak), original.capOf(S, peak));
  }
});

test("far future inventory stays non negative and fallback room index matches source", () => {
  for (const property of shared.props)
    for (const roomIndex of [-1, 9]) {
      const input = {
        property: propertyOf(property),
        roomIndex,
        date: "2030-07-01",
        today: TODAY,
      };
      const state = port.nightState(input);
      compare(
        state,
        original.nightState(property, roomIndex, shared.parse(input.date)),
      );
      expect(state.q).toBeGreaterThanOrEqual(0);
      expect(state.booked).toBeGreaterThanOrEqual(0);
      expect(state.held).toBeGreaterThanOrEqual(0);
    }
});

test("room types split each property's rooms exactly", () => {
  for (const property of shared.props) {
    const input = propertyOf(property);
    const total = input.roomTypes.reduce(
      (sum, _type, roomIndex) =>
        sum +
        port.nightState({
          property: input,
          roomIndex,
          date: TODAY,
          today: TODAY,
        }).S,
      0,
    );
    expect(total).toBe(property.rooms);
  }
});
