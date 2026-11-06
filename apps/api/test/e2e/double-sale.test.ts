import { expect, test } from "bun:test";
import { book, toMicros } from "@night-shares/market-model";
import { TransactionKind } from "@night-shares/proto/wallet/v1/transaction_pb";
import { pollReports } from "../../src/modules/double-sale/poll-reports";
import {
  adjustCoverAccount,
  coverAccount,
} from "../../src/modules/double-sale/repo/cover-accounts";
import { prepareCover } from "../../src/modules/double-sale/testing/scenario";
import { createSqliteHostRepo } from "../../src/modules/host/repo/host-repo.sqlite";
import { createSweep } from "../../src/modules/host/use-cases/payout/sweep";
import { createHarness } from "./harness";

test("neutral report refunds holder at pool bid and nets host debt on next automatic sweep", async () => {
  const h = await createHarness();
  try {
    const host = await h.signInAs("orb", "host");
    const holder = await h.signInAs("orb", "cover-holder");
    const { ports } = h.container;
    const { key } = prepareCover(ports, host.user, holder.user);
    const bid = toMicros(
      book(ports.inventory.get(key).state).bids[0]?.price ?? 0,
    );
    const balance = await ports.walletProvider.balance(
      holder.user.walletAddress,
    );
    ports.bookingReport.report(key, 1);
    await pollReports(ports);
    expect(await ports.walletProvider.balance(holder.user.walletAddress)).toBe(
      balance + bid,
    );
    const transactions = await holder.clients.wallet.listTransactions({});
    expect(
      transactions.transactions.filter(
        (tx) => tx.kind === TransactionKind.DOUBLE_SALE_REFUND,
      ),
    ).toHaveLength(3);
    const ledger = await ports.walletProvider.transactions(
      holder.user.walletAddress,
    );
    expect(ledger.map((tx) => tx.memo).sort()).toEqual([
      "double_sale_refund: cover",
      "double_sale_refund: pending",
      "double_sale_refund: reserve",
    ]);
    const account = coverAccount(ports.db, "prop_velana");
    expect(account.debt).toBeGreaterThan(bid);
    adjustCoverAccount(ports.db, "prop_velana", -account.spent, 0n);
    const payout = await host.clients.host.getPayout({
      propertyId: "prop_velana",
    });
    const swept = await createSweep({
      ports,
      repo: createSqliteHostRepo(ports),
    })(host.user.id, "prop_velana", host.user.walletAddress);
    expect(swept?.amount).toBe(payout.payout?.availableNow?.micros ?? 0n);
    expect(coverAccount(ports.db, "prop_velana").debt).toBe(0n);
    await pollReports(ports);
    expect(await ports.walletProvider.balance(holder.user.walletAddress)).toBe(
      balance + bid,
    );
  } finally {
    await h.close();
  }
});
