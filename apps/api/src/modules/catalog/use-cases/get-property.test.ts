import { expect, test } from "bun:test";
import { fixture } from "../../stay/test-support/fixture";
import { createGetProperty } from "./get-property";

test("property includes room types and rejects missing IDs", () => {
  const get = createGetProperty(fixture().ports);
  expect(get("prop_velana").roomTypes).toHaveLength(2);
  expect(() => get("missing")).toThrow("Property not found.");
});
