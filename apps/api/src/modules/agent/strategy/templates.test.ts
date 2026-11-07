import { expect, test } from "bun:test";
import { parseStrategy } from "./schema";
import { AGENT_TEMPLATES } from "./templates";

test("every template parses", () => {
  expect(Object.keys(AGENT_TEMPLATES)).toEqual([
    "buy-the-dip",
    "long-dated",
    "holiday-momentum",
  ]);
  for (const template of Object.values(AGENT_TEMPLATES)) {
    expect(parseStrategy(template.strategy)).toEqual(template.strategy);
  }
  expect(AGENT_TEMPLATES["buy-the-dip"].strategy.entry.maxPriceVsFairBps).toBe(
    300,
  );
  expect(AGENT_TEMPLATES["long-dated"].strategy.entry.minHoursToRelease).toBe(
    720,
  );
  expect(AGENT_TEMPLATES["holiday-momentum"].strategy.markets.weekdays).toEqual(
    [5, 6],
  );
});
