import { expect, test } from "bun:test";
import { prepareAsk } from "../../orders/prepare";
import { signedAsks } from "../../orders/store";
import { fixture } from "../../testing/fixture";
import { createAgentOrder } from "../account/create-agent-order";
import { postAsk } from "../account/post-ask";
import { fundFixtureAgent } from "../agent/testing";
import { buy } from "./buy";
import { quoteBuy } from "./quote-buy";
import { quoteSell } from "./quote-sell";
import { sell } from "./sell";

test("orders, signed asks and quotes reject fractional integer-tenths input", async () => {
  const d = await fixture();
  try {
    for (const size of [1.5, NaN, Infinity]) {
      expect(() => quoteBuy(d, d.key, size)).toThrow();
      expect(() => quoteSell(d, d.key, size)).toThrow();
      expect(() => prepareAsk(d, d.user, d.key, size, 1n)).toThrow();
      expect(() => postAsk(d, d.user, d.key, size, 1n)).toThrow();
      await expect(buy(d, d.user, d.key, size, 10n ** 12n)).rejects.toThrow();
      await expect(sell(d, d.user, d.key, size, 0n)).rejects.toThrow();
      await expect(
        createAgentOrder(d, d.user, d.key, size, 10n ** 12n),
      ).rejects.toThrow();
    }
  } finally {
    d.ports.db.close();
  }
});

test("odd-size multi-leg buy and agent order preserve exact tenths", async () => {
  const d = await fixture();
  try {
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      state: {
        ...r.state,
        S: 100,
        traderAsks: [
          { who: "mm-bot", price: 1, size: 0.1 + 0.2 },
          { who: "pool", price: 2, size: 0.5 },
        ],
      },
    }));
    const quote = quoteBuy(d, d.key, 11, d.user);
    expect(quote.fills.length).toBeGreaterThan(2);
    expect(quote.fills.reduce((sum, f) => sum + (f.size?.tenths ?? 0), 0)).toBe(
      11,
    );
    for (const f of quote.fills)
      expect(Number.isInteger(f.size?.tenths)).toBe(true);
    await buy(d, d.user, d.key, 11, 10n ** 12n);
    await fundFixtureAgent(d);
    await createAgentOrder(d, d.user, d.key, 3, 10n ** 12n);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(14);
  } finally {
    d.ports.db.close();
  }
});

test("signed ask partial fill caps odd size to remaining maker holding", async () => {
  const d = await fixture();
  try {
    await buy(d, d.user, d.key, 7, 10n ** 12n);
    postAsk(d, d.user, d.key, 7, 1000000n);
    await sell(d, d.user, d.key, 4, 0n);
    const buyer = {
      ...d.user,
      humanId: "other",
      walletAddress: await d.ports.walletProvider.linkWallet("other"),
    };
    await buy(d, buyer, d.key, 5, 10n ** 12n);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
    expect(d.repo.position(buyer.humanId, d.key).free).toBe(5);
    expect(Number(signedAsks(d.ports.db, d.key)[0]?.remaining)).toBe(4);
  } finally {
    d.ports.db.close();
  }
});
