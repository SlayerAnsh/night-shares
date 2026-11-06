import { expect, test } from "bun:test";
import { applyTraderAskFill } from "./apply-trader-ask-fill";
import { fixture } from "./fixture";

test("applyTraderAskFill updates state without changing its input", () => {
  const record = fixture();

  const before = structuredClone(record);
  const next = applyTraderAskFill(record, 0, 2);
  expect(next.state.traderAsks[0]?.size).toBe(0.3);
  expect(next.state.q).toBe(2);
  expect(next.state.held).toBe(1);
  expect(applyTraderAskFill(record, 0, 5).state.traderAsks).toEqual([]);
  expect(() => applyTraderAskFill(record, 0, 6)).toThrow();
  expect(record).toEqual(before);
});
