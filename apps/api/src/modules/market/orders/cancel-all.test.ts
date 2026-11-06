import { expect, test } from "bun:test";
import { fixture } from "../testing/fixture";
import { getPortfolio } from "../use-cases/account/get-portfolio";
import { postAsk } from "../use-cases/account/post-ask";
import { buy } from "../use-cases/trading/buy";
import { sell } from "../use-cases/trading/sell";
import { cancelAllAsks } from "./cancel-all";
import { makerNonce } from "./store";

test("linked-wallet replacement does not fill the old order or move tokens", async () => {
  const d = await fixture();
  try {
    await buy(d, d.user, d.key, 5, 10n ** 12n);
    postAsk(d, d.user, d.key, 5, 1000000n);
    const alternate = {
      ...d.user,
      walletAddress: await d.ports.walletProvider.linkWallet("alternate"),
    };
    postAsk(d, alternate, d.key, 5, 2000000n);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(5);
    expect(d.repo.position(d.user.humanId, d.key).closed).toBe(0);
    expect(getPortfolio(d, d.user).listings).toHaveLength(1);
    expect(cancelAllAsks(d, alternate)).toEqual({
      nonce: 1n,
      cancelledCount: 1,
    });
    expect(makerNonce(d.ports.db, d.user.walletAddress)).toBe(0n);
    expect(getPortfolio(d, d.user).listings).toHaveLength(0);
  } finally {
    d.ports.db.close();
  }
});
test("cancel all during failed settlement restores tokens without reopening the order", async () => {
  const d = await fixture();
  try {
    await buy(d, d.user, d.key, 5, 10n ** 12n);
    postAsk(d, d.user, d.key, 5, 1000000n);
    const buyer = {
      ...d.user,
      humanId: "buyer",
      id: "usr_buyer",
      walletAddress: await d.ports.walletProvider.linkWallet("buyer"),
    };
    d.ports.walletProvider.settle = async () => {
      cancelAllAsks(d, d.user);
      throw new Error("settlement failed");
    };
    await expect(buy(d, buyer, d.key, 3, 10n ** 12n)).rejects.toThrow(
      "settlement failed",
    );
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(5);
    expect(getPortfolio(d, d.user).listings).toHaveLength(0);
  } finally {
    d.ports.db.close();
  }
});

test("failed sell of listed tokens restores listing eligibility", async () => {
  const d = await fixture();
  try {
    await buy(d, d.user, d.key, 5, 10n ** 12n);
    postAsk(d, d.user, d.key, 5, 1000000n);
    const before = getPortfolio(d, d.user);
    d.ports.walletProvider.settle = async () => {
      throw new Error("settlement failed");
    };
    await expect(sell(d, d.user, d.key, 5, 0n)).rejects.toThrow(
      "settlement failed",
    );
    expect(getPortfolio(d, d.user)).toEqual(before);
  } finally {
    d.ports.db.close();
  }
});
