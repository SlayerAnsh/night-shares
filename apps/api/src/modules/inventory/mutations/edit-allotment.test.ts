import { expect, test } from "bun:test";
import { editAllotment } from "./edit-allotment";
import { fixture } from "./fixture";

test("editAllotment updates state without changing its input", () => {
  const record = fixture();

  const before = structuredClone(record);
  const next = editAllotment(record, {
    tenths: 40,
    preset: "peak",
    floor: 500,
  });
  expect(next.state.S).toBe(4);
  expect(next.state.k).toBe(1);
  expect(next.state.F).toBe(500);
  expect(next.state.cap).toBe(1.2);
  expect(() => editAllotment(record, { tenths: 19, preset: "calm" })).toThrow(
    "Allotment cannot be less",
  );
  expect(record).toEqual(before);
});
