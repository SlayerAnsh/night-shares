import { expect, test } from "bun:test";
import { mockSubjectFor } from "../../../../ports/identity-verifier/identity-verifier.mock";
import { createSqliteMarketRepo } from "../../repo/market-repo.sqlite";
import { fixture } from "../../testing/fixture";
import { postAsk } from "../account/post-ask";
import { buyAgent } from "../agent/buy";
import { fundFixtureAgent } from "../agent/testing";
import { getBook } from "../queries/get-book";
import { getNight } from "../queries/get-night";
import { buy } from "./buy";
import { sell } from "./sell";

async function hostFixture() {
  const d = await fixture();
  d.repo = createSqliteMarketRepo(d.ports.db);
  const humanId = mockSubjectFor("host");
  d.user = {
    ...d.user,
    id: "host-user",
    humanId,
    walletAddress: await d.ports.walletProvider.linkWallet(humanId),
  };
  d.ports.inventory.update(d.key, (r) => ({
    ...r,
    state: {
      ...r.state,
      F: 100,
      k: 0,
      S: 10,
      q: 0,
      held: 0,
      booked: 0,
      peak: false,
      traderAsks: [],
    },
  }));
  return d;
}

test("host pays full buyer and seller fees, its share funds rebates, holdings and sales are public", async () => {
  const d = await hostFixture();
  try {
    const wallet = d.ports.walletProvider;
    const balance = await wallet.balance(d.user.walletAddress);
    const rebates = await wallet.balance("rebate_pool");
    await buy(d, d.user, d.key, 10, 200000000n);
    expect(balance - (await wallet.balance(d.user.walletAddress))).toBe(
      101300000n,
    );
    expect((await wallet.balance("rebate_pool")) - rebates).toBe(1000000n);
    expect(getBook(d, d.key).holders).toEqual([
      {
        walletAddress: d.user.walletAddress,
        size: { tenths: 10 },
        isHost: true,
      },
    ]);
    const sold = await sell(d, d.user, d.key, 10, 0n);
    const gross = sold.quote?.gross?.micros ?? 0n;
    const fee = sold.quote?.fee?.micros ?? 0n;
    expect((await wallet.balance("rebate_pool")) - rebates).toBe(
      2000000n + fee - (gross * 13n) / 1000n,
    );
    expect(getNight(d, d.key).stats.hostSoldBack).toBe(true);
  } finally {
    d.ports.db.close();
  }
});

test("nonpeak cap combines main, agent and alternate host wallet with listed tokens", async () => {
  const d = await hostFixture();
  try {
    await fundFixtureAgent(d);
    await buy(d, d.user, d.key, 10, 200000000n);
    postAsk(d, d.user, d.key, 10, 200000000n);
    await buyAgent(d, d.user, d.key, 10, 200000000n);
    const alternate = {
      ...d.user,
      walletAddress: await d.ports.walletProvider.linkWallet("host-extra"),
    };
    await buy(d, alternate, d.key, 10, 200000000n);
    expect(d.repo.position(d.user.humanId, d.key).escrow).toBe(0);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(30);
    await expect(buy(d, alternate, d.key, 1, 200000000n)).rejects.toThrow(
      "Per-human cap exceeded.",
    );
    await expect(buyAgent(d, d.user, d.key, 1, 200000000n)).rejects.toThrow(
      "Per-human cap exceeded.",
    );
  } finally {
    d.ports.db.close();
  }
});

test("host ask seller pays full fee with host share redirected to rebates", async () => {
  const d = await hostFixture();
  try {
    await buy(d, d.user, d.key, 10, 200000000n);
    postAsk(d, d.user, d.key, 10, 50000000n);
    const buyer = {
      ...d.user,
      id: "buyer",
      humanId: "buyer",
      walletAddress: await d.ports.walletProvider.linkWallet("buyer"),
    };
    const before = await d.ports.walletProvider.balance("rebate_pool");
    await buy(d, buyer, d.key, 10, 100000000n);
    expect((await d.ports.walletProvider.balance("rebate_pool")) - before).toBe(
      250000n,
    );
    const fees = (
      await d.ports.walletProvider.transactions("rebate_pool")
    ).filter((tx) => tx.memo === "seller fee");
    expect(fees[0]?.amount).toBe(500000n);
  } finally {
    d.ports.db.close();
  }
});
