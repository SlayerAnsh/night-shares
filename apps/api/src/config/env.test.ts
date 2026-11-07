import { expect, test } from "bun:test";
import { envValue, normalizeEnv } from "./env";

test("normalization trims values without mutating the input", () => {
  const source = {
    EMPTY: "",
    SPACE: " \t\n",
    FALSE: " false ",
    ZERO: "0",
    VALUE: " value ",
    MISSING: undefined,
  };
  expect(normalizeEnv(source)).toEqual({
    EMPTY: undefined,
    SPACE: undefined,
    FALSE: "false",
    ZERO: "0",
    VALUE: "value",
    MISSING: undefined,
  });
  expect(source.VALUE).toBe(" value ");
});

test("direct env reads use current normalized values", () => {
  const key = "ENV_NORMALIZATION_TEST";
  const previous = process.env[key];
  try {
    for (const [raw, expected] of [
      ["", undefined],
      [" \t", undefined],
      [" false ", "false"],
      [" 0 ", "0"],
    ]) {
      process.env[key] = raw;
      expect(envValue(key)).toBe(expected);
    }
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
