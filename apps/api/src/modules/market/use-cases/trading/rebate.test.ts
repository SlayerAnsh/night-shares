import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { buy } from "./buy";

for (const [ask, funds, expected] of [
  [105, 1000000n, 525000n],
  [106, 1000000n, 0n],
  [100, 0n, 0n],
  [100, 7n, 7n],
] as const) {
  test(`ask ${ask}, pool funds ${funds}: rebate ${expected}`, async () => {
    const d = await fixture();
    try {
      const wallet = d.ports.walletProvider;
      const maker = await wallet.linkWallet("maker");
      const balance = await wallet.balance("rebate_pool");
      await wallet.transfer(
        "rebate_pool",
        "treasury",
        balance - funds,
        "drain",
      );
      d.ports.inventory.update(d.key, (r) => ({
        ...r,
        state: {
          ...r.state,
          F: 100,
          k: 0,
          S: 10,
          q: 10,
          booked: 8,
          held: 2,
          traderAsks: [{ who: maker, price: ask, size: 1 }],
        },
      }));
      const before = await wallet.balance(maker);
      await buy(d, d.user, d.key, 10, 10n ** 12n);
      expect(await wallet.balance(maker)).toBe(
        before + BigInt(ask) * 987000n + expected,
      );
      expect(await wallet.balance("rebate_pool")).toBe(funds - expected);
      const rebates = (await wallet.transactions(maker)).filter(
        (tx) => tx.memo === "rebate:maker",
      );
      expect(rebates).toHaveLength(expected > 0n ? 1 : 0);
      expect(d.ports.activity.list({ kinds: ["maker_rebate"] })).toHaveLength(
        expected > 0n ? 1 : 0,
      );
    } finally {
      d.ports.db.close();
    }
  });
}

test("failed atomic settlement restores reservation and emits no rebate", async () => {
  const d = await fixture();
  try {
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      state: {
        ...r.state,
        traderAsks: [{ who: "mm-bot", price: 1, size: 0.5 }],
      },
    }));
    const before = d.ports.inventory.get(d.key);
    d.ports.walletProvider.settle = async () => {
      throw new Error("settlement unavailable");
    };
    await expect(buy(d, d.user, d.key, 5, 10n ** 12n)).rejects.toThrow(
      "settlement unavailable",
    );
    expect(d.ports.inventory.get(d.key)).toEqual(before);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
    expect(d.ports.activity.list({ kinds: ["maker_rebate"] })).toEqual([]);
  } finally {
    d.ports.db.close();
  }
});
