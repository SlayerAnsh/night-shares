import { expect, test } from "bun:test";
import { loadConfig } from "./load-config";

test("boot defaults use SQLite, system time and random ids", () => {
  expect(loadConfig({})).toEqual({
    port: 8787,
    adapters: "mock",
    today: undefined,
    dbPath: "./data/night-shares.db",
    clock: "system",
    ids: "random",
  });
});
test("invalid environment values fail with their config key", () => {
  for (const [key, value] of Object.entries({
    PORT: "",
    DB_PATH: " ",
    TODAY: "2026-02-30",
    CLOCK: "fixed",
    IDS: "counter",
    ADAPTERS: "real",
  })) {
    expect(() => loadConfig({ [key]: value })).toThrow(key);
  }
  expect(
    loadConfig({
      PORT: "0",
      DB_PATH: ":memory:",
      CLOCK: "mock",
      IDS: "sequential",
    }).port,
  ).toBe(0);
});
