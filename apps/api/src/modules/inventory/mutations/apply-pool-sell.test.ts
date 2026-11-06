import { expect, test } from "bun:test";
import { applyPoolSell } from "./apply-pool-sell";
import { fixture } from "./fixture";

test("applyPoolSell updates state without changing its input", () => {
  const record = fixture();

  const before = structuredClone(record);
  const next = applyPoolSell(record, 3);
  expect(next.state.q).toBe(1.7);
  expect(next.state.held).toBe(0.7);
  expect(next.state.booked).toBe(1);
  expect(record).toEqual(before);
});
