import { expect, test } from "bun:test";
import { book, toMicros } from "@night-shares/market-model";
import { buildContainer } from "../../../container/build-container";
import { mockSubjectFor } from "../../../ports/identity-verifier/identity-verifier.mock";
import { createWithdraw } from "../../host/use-cases/payout/withdraw";
import { adjustCoverAccount, coverAccount } from "../repo/cover-accounts";
import { prepareCover } from "../testing/scenario";
import { handleReport } from "./handle-report";

async function setup() {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
    today: "2026-12-01",
  });
  const host = {
    id: "usr_host",
    humanId: mockSubjectFor("host"),
    level: "orb" as const,
    walletAddress: await ports.walletProvider.linkWallet("host"),
  };
  const holder = {
    id: "usr_holder",
    humanId: "holder",
    level: "orb" as const,
    walletAddress: await ports.walletProvider.linkWallet("holder"),
  };
  const scenario = prepareCover(ports, host, holder);
  const report = ports.bookingReport.report(scenario.key, 1);
  return { ports, host, holder, report, ...scenario };
}
test("report pays pool bid once through reserve, pending and fund, then nets debt", async () => {
  const f = await setup();
  const bid = toMicros(
    book(f.ports.inventory.get(f.key).state).bids[0]?.price ?? 0,
  );
  const balance = await f.ports.walletProvider.balance(f.holder.walletAddress);
  await Promise.all([
    handleReport(f.ports, f.report),
    handleReport(f.ports, f.report),
  ]);
  expect(await f.ports.walletProvider.balance(f.holder.walletAddress)).toBe(
    balance + bid,
  );
  const txs = await f.ports.walletProvider.transactions(f.holder.walletAddress);
  expect(txs.map((t) => t.memo).sort()).toEqual([
    "double_sale_refund: cover",
    "double_sale_refund: pending",
    "double_sale_refund: reserve",
  ]);
  expect(txs.find((t) => t.memo.endsWith("pending"))?.amount).toBe(1n);
  const account = coverAccount(f.ports.db, "prop_velana");
  expect(account.debt).toBeGreaterThan(bid);
  expect(f.ports.inventory.get(f.key).released).toBe(true);
  await handleReport(f.ports, f.report);
  expect(await f.ports.walletProvider.balance(f.holder.walletAddress)).toBe(
    balance + bid,
  );
  // A future host receipt makes the debt and a net withdrawal available.
  adjustCoverAccount(f.ports.db, "prop_velana", -account.spent, 0n);
  await createWithdraw({ ports: f.ports, repo: f.repo })(
    f.host,
    "prop_velana",
    1n,
  );
  expect(coverAccount(f.ports.db, "prop_velana").debt).toBe(0n);
});
test("failed settlement restores positions, inventory and debt and permits retry", async () => {
  const f = await setup();
  const before = f.ports.inventory.get(f.key);
  const account = coverAccount(f.ports.db, "prop_velana");
  const settle = f.ports.walletProvider.settle;
  f.ports.walletProvider.settle = async () => {
    throw new Error("offline");
  };
  await expect(handleReport(f.ports, f.report)).rejects.toThrow("offline");
  expect(f.ports.inventory.get(f.key)).toEqual(before);
  expect(coverAccount(f.ports.db, "prop_velana")).toEqual(account);
  expect(
    f.ports.db
      .query<{ free: bigint }, []>("SELECT free FROM market_positions")
      .get()?.free,
  ).toBe(10n);
  f.ports.walletProvider.settle = settle;
  await handleReport(f.ports, f.report);
  expect(f.ports.inventory.get(f.key).released).toBe(true);
});
