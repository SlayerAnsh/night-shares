import { expect, test } from "bun:test";
import { buildContainer } from "../../container/build-container";

test("mock reports retain stable ids across polls and return isolated copies", async () => {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
  });
  const report = ports.bookingReport.report({
    bookingId: "bk_test",
    userId: "usr_test",
    humanId: "human",
    reportedAt: ports.clock.now(),
  });
  const reports = await ports.bookingReport.poll();
  expect(reports).toEqual([report]);
  const first = reports[0];
  if (first) first.bookingId = "changed";
  expect(await ports.bookingReport.poll()).toEqual([report]);
});
