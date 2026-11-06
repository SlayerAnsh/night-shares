import { expect, test } from "bun:test";
import { fixture } from "./fixture";
import { openAllotment } from "./open-allotment";

test("openAllotment updates state without changing its input", () => {
  const record = fixture();
  record.stopped = true;
  record.openedAt = 0;
  const before = structuredClone(record);
  const next = openAllotment(record, { tenths: 30, preset: "normal" }, 123);
  expect(next.stopped).toBe(false);
  expect(next.openedAt).toBe(123);
  expect(next.state.S).toBe(3);
  expect(record).toEqual(before);
});
