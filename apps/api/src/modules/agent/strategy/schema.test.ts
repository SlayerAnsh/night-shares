import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { AgentStrategySchema } from "@night-shares/proto/agent/v1/strategy_pb";
import { DomainError } from "../../../shared/errors/domain-error";
import { strategyFromProto } from "./mapper";
import { parseStrategy } from "./schema";
import { AGENT_TEMPLATES } from "./templates";

const valid = () => structuredClone(AGENT_TEMPLATES["buy-the-dip"].strategy);
function rejects(value: unknown) {
  expect(() => parseStrategy(value)).toThrow(DomainError);
  try {
    parseStrategy(value);
  } catch (error) {
    expect((error as DomainError).code).toBe("INVALID_ARGUMENT");
  }
}

test("parse rejects unknown keys and out of range bps", () => {
  rejects({ ...valid(), reason: "Buy now" });
  for (const section of ["markets", "entry", "exit", "sizing"] as const) {
    const s = valid();
    rejects({ ...s, [section]: { ...s[section], extra: true } });
  }
  for (const bps of [-1, 10001, 0.5, Number.NaN, Infinity, "300"]) {
    const s = valid();
    rejects({ ...s, entry: { ...s.entry, maxPriceVsFairBps: bps } });
  }
});

test("parse validates version hours weekdays and integer tenths", () => {
  for (const value of [null, [], {}, { ...valid(), version: 2 }])
    rejects(value);
  for (const value of [-1, 2161, 1.5]) {
    const s = valid();
    rejects({ ...s, entry: { ...s.entry, minHoursToRelease: value } });
    rejects({ ...s, exit: { ...s.exit, exitHoursBeforeRelease: value } });
  }
  for (const value of [-1, 7, 1.5]) {
    const s = valid();
    rejects({ ...s, markets: { ...s.markets, weekdays: [value] } });
  }
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    rejects({ ...valid(), sizing: { maxPerNight: value, maxPerTrade: 1 } });
  }
  rejects({ ...valid(), sizing: { maxPerNight: 1, maxPerTrade: 2 } });
  const s = valid();
  s.entry.maxPriceVsFairBps = 10000;
  s.entry.minHoursToRelease = 2160;
  s.exit.stopLossBps = 0;
  s.markets.weekdays = [0, 6];
  expect(parseStrategy(s)).toEqual(s);
});

test("proto mapper strips metadata and unwraps tenths before validation", () => {
  const s = valid();
  s.markets.nights = [
    { propertyId: "prop_1", roomTypeId: "rt_1", date: "2026-11-20" },
  ];
  const proto = create(AgentStrategySchema, {
    ...s,
    sizing: { maxPerNight: { tenths: 10 }, maxPerTrade: { tenths: 5 } },
  });
  expect(strategyFromProto(proto)).toEqual(s);
  expect(() => strategyFromProto(create(AgentStrategySchema))).toThrow(
    DomainError,
  );
});
