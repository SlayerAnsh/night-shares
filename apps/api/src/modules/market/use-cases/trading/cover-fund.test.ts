import { expect, test } from "bun:test";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { fixture } from "../../testing/fixture";
import { buy } from "./buy";
import { sell } from "./sell";

for (const trader of [false, true]) {
  test(`${trader ? "trader" : "pool"} buy splits fees without changing buyer charges`, async () => {
    const d = await fixture();
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      state: {
        ...r.state,
        traderAsks: trader ? [{ who: "mm-bot", price: 1, size: 0.5 }] : [],
      },
    }));
    const wallet = d.ports.walletProvider;
    const buyer = await wallet.balance(d.user.walletAddress);
    const treasury = await wallet.balance(SYSTEM_ADDRESSES.treasury);
    const fund = await wallet.balance(SYSTEM_ADDRESSES.coverFund);
    const result = await buy(d, d.user, d.key, 5, 10n ** 12n);
    const gross = result.quote?.gross?.micros ?? 0n;
    const fee = result.quote?.fee?.micros ?? 0n;
    const cover = ((gross + 500n) / 1000n) * (trader ? 2n : 1n);
    expect((await wallet.balance(SYSTEM_ADDRESSES.coverFund)) - fund).toBe(
      cover,
    );
    expect((await wallet.balance(SYSTEM_ADDRESSES.treasury)) - treasury).toBe(
      (fee - (gross + 50n) / 100n) * (trader ? 2n : 1n) - cover,
    );
    expect(buyer - (await wallet.balance(d.user.walletAddress))).toBe(
      result.quote?.total?.micros ?? 0n,
    );
  });
}

test("sell back funds cover from gross notional while preserving net payout", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  const wallet = d.ports.walletProvider;
  const rebate = await wallet.balance(SYSTEM_ADDRESSES.rebatePool);
  const seller = await wallet.balance(d.user.walletAddress);
  const pool = await wallet.balance(SYSTEM_ADDRESSES.pool);
  const treasury = await wallet.balance(SYSTEM_ADDRESSES.treasury);
  const fund = await wallet.balance(SYSTEM_ADDRESSES.coverFund);
  const result = await sell(d, d.user, d.key, 5, 0n);
  const gross = result.quote?.gross?.micros ?? 0n;
  const fee = result.quote?.fee?.micros ?? 0n;
  const base = (gross * 13000n + 500000n) / 1000000n;
  const cover = (gross + 500n) / 1000n;
  expect((await wallet.balance(SYSTEM_ADDRESSES.coverFund)) - fund).toBe(cover);
  expect((await wallet.balance(SYSTEM_ADDRESSES.treasury)) - treasury).toBe(
    base - cover - (gross + 50n) / 100n,
  );
  expect((await wallet.balance(d.user.walletAddress)) - seller).toBe(
    result.quote?.total?.micros ?? 0n,
  );
  expect(await wallet.balance(SYSTEM_ADDRESSES.rebatePool)).toBe(
    rebate + fee - base,
  );
  expect(pool - (await wallet.balance(SYSTEM_ADDRESSES.pool))).toBe(gross);
});
