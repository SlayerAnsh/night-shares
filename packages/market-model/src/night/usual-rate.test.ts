import { expect, test } from "bun:test";
import { nightPrice } from "./usual-rate";

test("usual rate needs only id, base and phase and repeats for the same night", () => {
  const p = { id: "test", base: 100, phase: 0 };
  expect(nightPrice(p, "2026-12-25")).toBe(nightPrice(p, "2026-12-25"));
  expect(nightPrice(p, "2026-12-25")).toBeGreaterThan(
    nightPrice(p, "2026-12-18"),
  );
});
