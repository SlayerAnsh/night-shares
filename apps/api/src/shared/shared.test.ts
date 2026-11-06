import { expect, test } from "bun:test";
import { loadConfig } from "../config/load-config";
import { addDays, diffDays, range } from "./dates";
import { add, fromProto, fromUsd, mulTenths, toProto } from "./money";
import {
  format,
  fromProto as nightFromProto,
  toProto as nightToProto,
  parse,
} from "./night-key";

test("dates cross leap days and years with exclusive range ends", () => {
  expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  expect(diffDays("2026-12-31", "2027-01-02")).toBe(2);
  expect(range("2026-12-31", "2027-01-02")).toEqual([
    "2026-12-31",
    "2027-01-01",
  ]);
  expect(() => addDays("2026-02-29", 1)).toThrow();
});
test("money retains bigint precision and protobuf round trips", () => {
  const amount = 9_007_199_254_740_993n;
  expect(fromProto(toProto(amount))).toBe(amount);
  expect(fromUsd(12.34)).toBe(12_340_000n);
  expect(mulTenths(15n, 3)).toBe(4n);
  expect(add(1n, 2n)).toBe(3n);
});
test("night keys validate identity and calendar dates", () => {
  const key = "prop_velana:rt_velana_0:2026-12-24";
  expect(format(parse(key))).toBe(key);
  expect(nightFromProto(nightToProto(key))).toBe(key);
  expect(() => parse(`${key}:extra`)).toThrow();
});
test("configuration validates adapters, ports and deterministic TODAY", () => {
  expect(loadConfig({})).toEqual({
    port: 8787,
    adapters: "mock",
    today: undefined,
    dbPath: "./data/night-shares.db",
    clock: "system",
    ids: "random",
  });
  expect(() => loadConfig({ CLOCK: "fast" })).toThrow();
  expect(() => loadConfig({ IDS: "uuid" })).toThrow();
  expect(loadConfig({ TODAY: "2026-12-01", PORT: "0" }).port).toBe(0);
  expect(() => loadConfig({ ADAPTERS: "real" })).toThrow();
  expect(() => loadConfig({ PORT: "1.5" })).toThrow();
  expect(() => loadConfig({ TODAY: "2026-02-30" })).toThrow();
});
