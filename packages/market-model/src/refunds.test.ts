import { expect, test } from "bun:test";
import { offlineSaleRefund, unsoldRefund } from "./refunds";

test("parked asks receive half fair refund tapering to zero at twice fair", () => {
  expect(unsoldRefund(null, 100)).toBe(0);
  expect(unsoldRefund(undefined, 100)).toBe(0);
  expect(unsoldRefund(90, 100)).toBe(50);
  expect(unsoldRefund(150, 100)).toBe(25);
  expect(unsoldRefund(200, 100)).toBe(0);
  expect(offlineSaleRefund(100)).toBe(100);
});
