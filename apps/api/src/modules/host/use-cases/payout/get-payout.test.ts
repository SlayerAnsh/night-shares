import { expect, test } from "bun:test";
import { hostPayout, toMicros } from "@night-shares/market-model";
import { fixture } from "../fixture";

test("payout sums sixty days and subtracts only this host's withdrawals", () => {
  const f = fixture(),
    pay = f.use.getPayout(f.userId, "prop_velana");
  const rows = f.ports.inventory.list({
    propertyId: "prop_velana",
    start: "2026-12-01",
    end: "2027-01-30",
  });
  expect(rows).toHaveLength(120);
  expect(pay.gross.micros).toBe(
    rows.reduce((n, r) => n + toMicros(hostPayout(r.state).gross), 0n),
  );
  f.repo.addWithdrawal(f.userId, "prop_velana", 100n);
  expect(f.use.getPayout(f.userId, "prop_velana").availableNow.micros).toBe(
    pay.availableNow.micros - 100n,
  );
  expect(f.use.getPayout("other", "prop_velana")).toEqual(pay);
});
