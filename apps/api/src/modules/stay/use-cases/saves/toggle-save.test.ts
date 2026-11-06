import { expect, test } from "bun:test";
import { fixture } from "../../test-support/fixture";

test("toggle adds and removes saved properties per user", () => {
  const f = fixture();
  expect(f.cases.toggleSave("prop_velana", "alice")).toBe(true);
  expect(f.cases.toggleSave("prop_velana", "alice")).toBe(false);
  expect(() => f.cases.toggleSave("missing", "alice")).toThrow();
});
