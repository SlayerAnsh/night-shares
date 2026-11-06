import { expect, test } from "bun:test";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import type { ActivityEvent } from "./activity-log";
import { createMemoryActivityLog } from "./activity-log.memory";

test("activity filters combine before limiting newest events", () => {
  const clock = createMockClock(1000);
  const log = createMemoryActivityLog({ clock, ids: createMockIdGenerator() });
  const input: Omit<ActivityEvent, "id" | "at"> = {
    nightKey: "prop_velana:rt_velana_0:2026-12-24",
    propertyId: "prop_velana",
    kind: "trader_bought",
    tenths: 1,
    priceMicros: 123456789012345678n,
    actor: "trader",
    userId: "usr_0001",
  };
  expect(log.list({})).toEqual([]);
  const first = log.append(input);
  expect(first).toEqual({ ...input, id: "act_0001", at: 1000 });
  clock.advance(100);
  const second = log.append({ ...input, kind: "ask_posted" });
  const third = log.append({
    ...input,
    nightKey: "other",
    propertyId: "prop_other",
  });
  expect(log.list({})).toEqual([third, second, first]);
  expect(log.list({ nightKey: input.nightKey })).toEqual([second, first]);
  expect(
    log.list({
      propertyId: input.propertyId,
      kinds: ["trader_bought"],
      limit: 1,
    }),
  ).toEqual([first]);
  expect(
    log.list({ kinds: ["ask_posted", "trader_bought"], limit: 2 }),
  ).toEqual([third, second]);
  expect(
    log.list({ nightKey: input.nightKey, propertyId: "prop_other" }),
  ).toEqual([]);
  expect(log.list({ kinds: [] })).toEqual([]);
  expect(log.list({ limit: 0 })).toEqual([]);
  input.tenths = 99;
  first.tenths = 99;
  const listed = log.list({});
  if (listed[0]) listed[0].tenths = 99;
  expect(log.list({}).map((event) => event.tenths)).toEqual([1, 1, 1]);
});
