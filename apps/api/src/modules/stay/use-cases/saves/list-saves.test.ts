import { expect, test } from "bun:test";
import { fixture } from "../../test-support/fixture";

test("saved properties never leak between users", () => {
  const f = fixture();
  f.cases.toggleSave("prop_velana", "alice");
  expect(f.cases.listSaves("alice").map((p) => p.id)).toEqual(["prop_velana"]);
  expect(f.cases.listSaves("bob")).toEqual([]);
});
