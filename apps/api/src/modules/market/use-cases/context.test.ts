import { expect, test } from "bun:test";
import { fixture } from "../testing/fixture";
import { assertOpen, nightKey, quantity } from "./context";

test("boundary validation rejects missing nights and invalid quantities", () => {
  expect(() => nightKey()).toThrow("Choose a night.");
  for (const tenths of [0, -1, 0.5, Number.NaN])
    expect(() => quantity({ tenths })).toThrow("positive integer tenths");
});
test("stopped and expired nights reject trading", async () => {
  const d = await fixture(),
    record = d.ports.inventory.get(d.key);
  expect(() => assertOpen(d.ports, { ...record, stopped: true })).toThrow(
    "no longer trading",
  );
  expect(() => assertOpen(d.ports, { ...record, date: "2026-11-30" })).toThrow(
    "no longer trading",
  );
});
