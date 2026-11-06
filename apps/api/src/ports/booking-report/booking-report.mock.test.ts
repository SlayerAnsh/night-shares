import { expect, test } from "bun:test";
import { buildContainer } from "../../container/build-container";

test("mock reports retain stable ids across polls and return isolated copies", async () => {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
  });
  const report = ports.bookingReport.report(
    "prop_velana:rt_velana_0:2026-12-24",
    1,
  );
  const reports = await ports.bookingReport.poll();
  expect(reports).toEqual([report]);
  const first = reports[0];
  if (first) first.rooms = 20;
  expect(await ports.bookingReport.poll()).toEqual([report]);
  expect(() => ports.bookingReport.report(report.nightKey, 0)).toThrow();
});
