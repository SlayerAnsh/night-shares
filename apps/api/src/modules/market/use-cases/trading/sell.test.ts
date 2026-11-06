import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { buy } from "./buy";
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
