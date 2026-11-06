import { expect, test } from "bun:test";
import { applyPoolBuy } from "./apply-pool-buy";
import { fixture } from "./fixture";

test("applyPoolBuy updates state without changing its input", () => {
  const record = fixture();

  const before = structuredClone(record);
  const next = applyPoolBuy(record, 3);
  expect(next.state.q).toBe(2.3);
  expect(next.state.held).toBe(1.3);
  expect(next.state.booked).toBe(1);
  expect(record).toEqual(before);
});
