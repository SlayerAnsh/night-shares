import { expect, test } from "bun:test";
import { fixture } from "./fixture";
import { stop } from "./stop";

test("stop updates state without changing its input", () => {
  const record = fixture();

  const before = structuredClone(record);
  const next = stop(record);
  expect(next.stopped).toBe(true);
  expect(next.state).toEqual(record.state);
  expect(record).toEqual(before);
});
