import { expect, test } from "bun:test";
import { safeNext } from "./safe-next";

test("keeps same-site paths and their query strings", () => {
  for (const path of [
    "/",
    "/stay/prop_velana?rooms=2",
    "/trade/prop%3Art%3A2026-12-24",
    "/host#calendar",
  ])
    expect(safeNext(path)).toBe(path);
});
test("rejects external and browser-normalized redirects", () => {
  for (const path of [
    undefined,
    null,
    "",
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\n/evil.test",
    "javascript:alert(1)",
    "stay",
  ])
    expect(safeNext(path)).toBe("/");
});
