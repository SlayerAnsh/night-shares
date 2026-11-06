import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { getNight } from "./get-night";

test("night details include deterministic history, stats, track and month", async () => {
  const d = await fixture(),
    result = getNight(d, d.key);
  expect(result.priceHistory).toHaveLength(31);
  expect(result.monthCalendar).toHaveLength(31);
  expect(result.stats.sellThroughBps).toBeGreaterThan(0);
  expect(result.hostTrackRecord.nightsTraded).toBeGreaterThan(0);
  expect(getNight(d, d.key)).toEqual(result);
});
