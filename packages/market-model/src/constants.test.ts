import { expect, test } from "bun:test";
import * as c from "./constants";

test("fees split into host and platform shares", () => {
  expect(c.HOST_FEE + c.PLATFORM_FEE).toBeCloseTo(c.FEE, 12);
  expect(c.PRESETS).toEqual({ calm: 0.3, normal: 0.6, peak: 1 });
  expect(c.SLICE).toBe(0.1);
});
