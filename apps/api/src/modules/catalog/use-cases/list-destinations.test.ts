import { expect, test } from "bun:test";
import { fixture } from "../../stay/test-support/fixture";
import { createListDestinations } from "./list-destinations";

test("destinations filter city and country with stay counts and starting prices", () => {
  const list = createListDestinations(fixture().ports);
  const all = list("");
  expect(all).toHaveLength(6);
  expect(all.every((d) => d.stayCount > 0 && d.fromPrice.micros > 0n)).toBe(
    true,
  );
  expect(list("bali")).toHaveLength(1);
  expect(list("missing")).toHaveLength(0);
});
