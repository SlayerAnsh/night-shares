import { expect } from "bun:test";

export function compare(
  actual: unknown,
  expected: unknown,
  path = "result",
): void {
  if (typeof actual === "number" && typeof expected === "number") {
    if (Object.is(actual, expected)) return;
    if (Math.abs(actual - expected) <= 1e-9) return;
    throw new Error(`${path}: ${actual} differs from ${expected}`);
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    expect(actual.length).toBe(expected.length);
    actual.forEach((value: unknown, i: number) => {
      compare(value, expected[i], `${path}[${i}]`);
    });
    return;
  }
  if (
    actual !== null &&
    expected !== null &&
    typeof actual === "object" &&
    typeof expected === "object"
  ) {
    const a = actual as Record<string, unknown>,
      b = expected as Record<string, unknown>;
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    for (const key of Object.keys(a)) compare(a[key], b[key], `${path}.${key}`);
    return;
  }
  expect(actual).toBe(expected);
}
