import { expect, test } from "bun:test";
import { fixture } from "../fixture";

async function setup() {
  const f = fixture();
  const user = {
    id: f.userId,
    humanId: "human_host",
    level: "orb" as const,
    walletAddress: await f.ports.walletProvider.linkWallet("human_host"),
  };
  return { ...f, user };
}
test("withdraw increases wallet exactly once under concurrent requests", async () => {
  const f = await setup(),
    before = await f.ports.walletProvider.balance(f.user.walletAddress);
  const available = f.use.getPayout(f.userId, "prop_velana").availableNow
    .micros;
  const results = await Promise.allSettled([
    f.use.withdraw(f.user, "prop_velana"),
    f.use.withdraw(f.user, "prop_velana"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
    before + available,
  );
  expect(f.use.getPayout(f.userId, "prop_velana").availableNow.micros).toBe(0n);
});
test("failed transfer restores payout and invalid amounts never transfer", async () => {
  const f = await setup(),
    before = f.use.getPayout(f.userId, "prop_velana");
  f.ports.walletProvider.settle = async () => {
    throw new Error("provider unavailable");
  };
  await expect(f.use.withdraw(f.user, "prop_velana", 1n)).rejects.toThrow(
    "provider unavailable",
  );
  expect(f.use.getPayout(f.userId, "prop_velana")).toEqual(before);
  await expect(f.use.withdraw(f.user, "prop_velana", -1n)).rejects.toThrow(
    "available payout",
  );
});
