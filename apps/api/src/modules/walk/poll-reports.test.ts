import { expect, test } from "bun:test";
import { pollReports } from "./poll-reports";
import { fixture } from "./testing/fixture";

test("neutral report adapter settles authenticated report once across polls", async () => {
  const f = await fixture();
  f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
  f.ports.bookingReport.report(f.report);
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  await pollReports(f.ports);
  await pollReports(f.ports);
  expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
    before + 20000n,
  );
});
