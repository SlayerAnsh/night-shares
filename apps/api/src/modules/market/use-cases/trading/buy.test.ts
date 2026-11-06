import { expect, test } from "bun:test";
import { toMicros } from "@night-shares/market-model";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { fixture } from "../../testing/fixture";
import { getPortfolio } from "../account/get-portfolio";
import { postAsk } from "../account/post-ask";
import { buy } from "./buy";
import { quoteBuy } from "./quote-buy";

test("buy debits quoted micros and records holdings", async () => {
  const d = await fixture(),
    before = await d.ports.walletProvider.balance(d.user.walletAddress);
  const quote = quoteBuy(d, d.key, 5, d.user);
  const result = await buy(d, d.user, d.key, 5, quote.total?.micros ?? 0n);
  expect(result.quote?.filled?.tenths).toBe(5);
  expect(
    before - (await d.ports.walletProvider.balance(d.user.walletAddress)),
  ).toBe(quote.total?.micros ?? 0n);
  expect(getPortfolio(d, d.user).holdings[0]?.size?.tenths).toBe(5);
});
test("slippage, cap and balance failures preserve inventory", async () => {
  const d = await fixture(),
    initial = d.ports.inventory.get(d.key);
  await expect(buy(d, d.user, d.key, 5, 0n)).rejects.toThrow("Price moved.");
  await expect(buy(d, d.user, d.key, 10000, 10n ** 12n)).rejects.toThrow("cap");
  const balance = await d.ports.walletProvider.balance(d.user.walletAddress);
  await d.ports.walletProvider.transfer(
    d.user.walletAddress,
    "pool",
    balance,
    "empty test wallet",
  );
  await expect(buy(d, d.user, d.key, 1, 10n ** 12n)).rejects.toThrow(
    "Not enough USDC.",
  );
  expect(d.ports.inventory.get(d.key)).toEqual(initial);
});
test("trader fill pays seller and treasury and reconciles seller holdings", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  postAsk(d, d.user, d.key, 5, toMicros(1));
  const buyer = {
    ...d.user,
    id: "usr_buyer",
    humanId: "buyer",
    walletAddress: await d.ports.walletProvider.linkWallet("buyer"),
  };
  const before = await d.ports.walletProvider.balance(d.user.walletAddress);
  await buy(d, buyer, d.key, 2, toMicros(10));
  expect(
    (await d.ports.walletProvider.balance(d.user.walletAddress)) - before,
  ).toBe(197400n);
  expect(getPortfolio(d, d.user).holdings[0]?.size?.tenths).toBe(3);
  expect(getPortfolio(d, d.user).listings[0]?.size?.tenths).toBe(3);
});
test("seeded market maker receives seller proceeds", async () => {
  const d = await fixture();
  d.ports.inventory.update(d.key, (r) => ({
    ...r,
    state: { ...r.state, traderAsks: [{ who: "mm-bot", price: 1, size: 0.5 }] },
  }));
  const maker = SYSTEM_ADDRESSES.marketMaker;
  const before = await d.ports.walletProvider.balance(maker);
  await buy(d, d.user, d.key, 5, toMicros(10));
  expect((await d.ports.walletProvider.balance(maker)) - before).toBe(493500n);
});
test("escrowed holdings still count toward the human cap", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  postAsk(d, d.user, d.key, 5, 1000000n);
  await expect(buy(d, d.user, d.key, 26, 10n ** 12n)).rejects.toThrow("cap");
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
});
test("one-micro ask skips rounded-zero fee transfers", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 10, 10n ** 12n);
  postAsk(d, d.user, d.key, 10, 1n);
  const buyer = {
    ...d.user,
    id: "tiny_buyer",
    humanId: "tiny",
    walletAddress: await d.ports.walletProvider.linkWallet("tiny"),
  };
  const before = await d.ports.walletProvider.balance(buyer.walletAddress);
  await buy(d, buyer, d.key, 10, 1n);
  expect(
    before - (await d.ports.walletProvider.balance(buyer.walletAddress)),
  ).toBe(1n);
});
