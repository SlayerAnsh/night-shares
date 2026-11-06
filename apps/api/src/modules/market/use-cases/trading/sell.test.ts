import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { buy } from "./buy";
import { quoteSell } from "./quote-sell";
import { sell } from "./sell";

test("sell back pays net and records realised pnl", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  const before = await d.ports.walletProvider.balance(d.user.walletAddress);
  const result = await sell(d, d.user, d.key, 5, 0n);
  expect(
    (await d.ports.walletProvider.balance(d.user.walletAddress)) - before,
  ).toBe(result.quote?.total?.micros ?? 0n);
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
  expect(d.repo.position(d.user.humanId, d.key).realised).toBeLessThan(0n);
});
test("sell refuses unowned size and minimum price movement", async () => {
  const d = await fixture();
  await expect(sell(d, d.user, d.key, 1, 0n)).rejects.toThrow("Not enough");
  await buy(d, d.user, d.key, 1, 10n ** 12n);
  const before = d.ports.inventory.get(d.key);
  await expect(sell(d, d.user, d.key, 1, 10n ** 12n)).rejects.toThrow(
    "Price moved.",
  );
  expect(d.ports.inventory.get(d.key)).toEqual(before);
});

test("unfunded pool sale restores inventory and every position statistic", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  const before = d.ports.inventory.get(d.key);
  const position = { ...d.repo.position(d.user.humanId, d.key) };
  const wallet = d.ports.walletProvider;
  await wallet.transfer(
    "pool",
    "treasury",
    await wallet.balance("pool"),
    "test drain",
  );
  await expect(sell(d, d.user, d.key, 5, 0n)).rejects.toThrow(
    "Not enough USDC.",
  );
  expect(d.ports.inventory.get(d.key)).toEqual(before);
  expect(d.repo.position(d.user.humanId, d.key)).toEqual(position);
});

test("parallel sellers cannot spend the same pool balance", async () => {
  const d = await fixture();
  const wallet = d.ports.walletProvider;
  const second = {
    ...d.user,
    id: "second",
    humanId: "second",
    walletAddress: await wallet.linkWallet("second"),
  };
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  await buy(d, second, d.key, 5, 10n ** 12n);
  const before = d.ports.inventory.get(d.key);
  const gross = quoteSell(d, d.key, 5, d.user).gross?.micros ?? 0n;
  await wallet.transfer(
    "pool",
    "treasury",
    (await wallet.balance("pool")) - gross,
    "test funding",
  );
  const results = await Promise.all([
    sell(d, d.user, d.key, 5, 0n).then(
      () => true,
      () => false,
    ),
    sell(d, second, d.key, 5, 0n).then(
      () => true,
      () => false,
    ),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(d.ports.inventory.get(d.key).state.q).toBeCloseTo(
    before.state.q - 0.5,
  );
  expect(
    d.repo.position(d.user.humanId, d.key).free +
      d.repo.position(second.humanId, d.key).free,
  ).toBe(5);
  expect(await wallet.balance("pool")).toBeGreaterThanOrEqual(0n);
});
