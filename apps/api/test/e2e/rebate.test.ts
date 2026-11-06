import { expect, test } from "bun:test";
import { TransactionKind } from "@night-shares/proto/wallet/v1/transaction_pb";
import { createHarness } from "./harness";

const night = {
  propertyId: "prop_velana",
  roomTypeId: "rt_velana_0",
  date: "2026-12-01",
};
const key = `${night.propertyId}:${night.roomTypeId}:${night.date}`;

test("late sell-back excess funds the rebate pool", async () => {
  const h = await createHarness();
  try {
    const { clients } = await h.signInAs("orb", "rebate_seller");
    const wallet = h.container.ports.walletProvider;
    await clients.market.buy({
      night,
      size: { tenths: 5 },
      maxTotal: { micros: 10n ** 12n },
    });
    const before = await wallet.balance("rebate_pool");
    const treasury = await wallet.balance("treasury");
    const result = await clients.market.sell({
      night,
      size: { tenths: 5 },
      minTotal: { micros: 0n },
    });
    const quote = result.execution?.quote;
    const gross = quote?.gross?.micros ?? 0n;
    const fee = quote?.fee?.micros ?? 0n;
    const base = (gross * 13000n + 500000n) / 1000000n;
    expect(fee).toBeGreaterThan(base);
    expect(await wallet.balance("rebate_pool")).toBe(before + fee - base);
    expect(await wallet.balance("treasury")).toBe(
      treasury + base - (gross + 500n) / 1000n - (gross + 50n) / 100n,
    );
  } finally {
    await h.close();
  }
});

for (const [ask, funds, rebate] of [
  [105, 1000000n, 525000n],
  [106, 1000000n, 0n],
  [100, 0n, 0n],
] as const) {
  test(`ask ${ask} with pool funds ${funds} pays rebate ${rebate}`, async () => {
    const h = await createHarness();
    try {
      const maker = await h.signInAs("orb", "rebate_maker");
      const buyer = await h.signInAs("orb", "rebate_buyer");
      const { ports } = h.container;
      const wallet = ports.walletProvider;
      ports.inventory.update(key, (r) => ({
        ...r,
        state: {
          ...r.state,
          F: 100,
          k: 0,
          S: 10,
          q: 2,
          held: 1,
          booked: 1,
          traderAsks: [],
        },
      }));
      await maker.clients.market.buy({
        night,
        size: { tenths: 10 },
        maxTotal: { micros: 10n ** 12n },
      });
      await maker.clients.market.postAsk({
        night,
        size: { tenths: 10 },
        price: { micros: BigInt(ask) * 1000000n },
      });
      // Book the remaining pool inventory so only the trader ask can fill.
      ports.inventory.update(key, (r) => ({
        ...r,
        state: { ...r.state, q: r.state.S, booked: r.state.S - r.state.held },
      }));
      const poolBalance = await wallet.balance("rebate_pool");
      await wallet.transfer(
        "rebate_pool",
        "treasury",
        poolBalance - funds,
        "drain",
      );
      const before = await wallet.balance(maker.user.walletAddress);
      await buyer.clients.market.buy({
        night,
        size: { tenths: 10 },
        maxTotal: { micros: 10n ** 12n },
      });
      expect(await wallet.balance(maker.user.walletAddress)).toBe(
        before + BigInt(ask) * 987000n + rebate,
      );
      expect(await wallet.balance("rebate_pool")).toBe(funds - rebate);
      const transactions = await maker.clients.wallet.listTransactions({});
      expect(
        transactions.transactions.filter(
          (tx) => tx.kind === TransactionKind.REBATE,
        ),
      ).toHaveLength(rebate > 0n ? 1 : 0);
    } finally {
      await h.close();
    }
  });
}
