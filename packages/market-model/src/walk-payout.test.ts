import { expect, test } from "bun:test";
import {
  WALK_MULTIPLE,
  WALK_REPORT_HOURS,
  WALK_SUSPEND_AFTER,
  walkPayout,
} from "./index";

test("walk constants freeze compensation, reporting and suspension rules", () => {
  expect(WALK_MULTIPLE).toBe(1);
  expect(WALK_REPORT_HOURS).toBe(24);
  expect(WALK_SUSPEND_AFTER).toBe(2);
});

test("walk compensation uses pending payouts before cover fund debt", () => {
  expect(walkPayout({ paid: 10000, pending: 6000 })).toEqual({
    toGuest: 10000,
    fromPending: 6000,
    fromFund: 4000,
    hostDebt: 4000,
  });
  expect(walkPayout({ paid: 10000, pending: 30000 })).toEqual({
    toGuest: 10000,
    fromPending: 10000,
    fromFund: 0,
    hostDebt: 0,
  });
  for (const pending of [undefined, -1, 0]) {
    expect(walkPayout({ paid: 10000, pending })).toEqual({
      toGuest: 10000,
      fromPending: 0,
      fromFund: 10000,
      hostDebt: 10000,
    });
  }
  expect(walkPayout({ paid: 0, pending: 10 })).toEqual({
    toGuest: 0,
    fromPending: 0,
    fromFund: 0,
    hostDebt: 0,
  });
});
