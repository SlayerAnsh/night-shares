import { expect, test } from "bun:test";
import { offlineSaleCover } from "./offline-sale-cover";

test("offline double sale uses reserves, pending payouts, then the fund", () => {
  expect(
    offlineSaleCover({ pstar: 16000, reserveSlice: 11000, pending: 3000 }),
  ).toEqual({
    toHolder: 16000,
    fromReserve: 11000,
    fromPending: 3000,
    fromFund: 2000,
    penalty: 16000,
    penaltyFromPending: 0,
    hostDebt: 18000,
    hostTotal: 32000,
  });
});
test("missing reserves and pending payouts leave the advance and penalty as debt", () => {
  expect(offlineSaleCover({ pstar: 100 })).toEqual({
    toHolder: 100,
    fromReserve: 0,
    fromPending: 0,
    fromFund: 100,
    penalty: 100,
    penaltyFromPending: 0,
    hostDebt: 200,
    hostTotal: 200,
  });
});
test("excess pending payouts settle the holder and penalty without extra collection", () => {
  expect(
    offlineSaleCover({ pstar: 100, reserveSlice: 30, pending: 500 }),
  ).toEqual({
    toHolder: 100,
    fromReserve: 30,
    fromPending: 70,
    fromFund: 0,
    penalty: 100,
    penaltyFromPending: 100,
    hostDebt: 0,
    hostTotal: 200,
  });
});
test("zero fair price collects nothing and negative balances are unavailable", () => {
  expect(
    Object.values(
      offlineSaleCover({ pstar: 0, reserveSlice: 20, pending: 20 }),
    ),
  ).toEqual(Array(8).fill(0));
  expect(
    offlineSaleCover({ pstar: 100, reserveSlice: -20, pending: -50 }),
  ).toEqual(offlineSaleCover({ pstar: 100 }));
});
