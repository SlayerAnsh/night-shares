import { expect, test } from "bun:test";
import { offlineSaleRefund } from "./refunds";

test("offline sale refunds the pool bid", () => {
  expect(offlineSaleRefund(100)).toBe(100);
});
