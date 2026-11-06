import { expect, test } from "bun:test";
import {
  adjustCoverAccount,
  coverAccount,
} from "../../../double-sale/repo/cover-accounts";
import { fixture } from "../fixture";
import { createSweep } from "./sweep";

async function setup() {
  const f = fixture();
  const user = {
    id: f.userId,
    humanId: "host",
    level: "orb" as const,
    walletAddress: await f.ports.walletProvider.linkWallet("host"),
  };
  return { ...f, user };
}
test("debt exceeding payout receives partial repayment with zero host transfer", async () => {
  const f = await setup();
  const gross = f.use.getPayout(f.userId, "prop_velana").availableNow.micros;
  adjustCoverAccount(f.ports.db, "prop_velana", 0n, gross + 100n);
  expect(f.use.getPayout(f.userId, "prop_velana").availableNow.micros).toBe(0n);
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  const result = await createSweep(f)(
    f.user.id,
    "prop_velana",
    f.user.walletAddress,
  );
  expect(result?.amount).toBe(0n);
  expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
    before,
  );
  expect(coverAccount(f.ports.db, "prop_velana")).toEqual({
    spent: gross,
    debt: 100n,
  });
});
test("failed sweep restores debt and available payout together", async () => {
  const f = await setup();
  adjustCoverAccount(f.ports.db, "prop_velana", 0n, 100n);
  const before = f.use.getPayout(f.userId, "prop_velana");
  f.ports.walletProvider.settle = async () => {
    throw new Error("offline");
  };
  await expect(
    createSweep(f)(f.user.id, "prop_velana", f.user.walletAddress),
  ).rejects.toThrow("offline");
  expect(coverAccount(f.ports.db, "prop_velana")).toEqual({
    spent: 0n,
    debt: 100n,
  });
  expect(f.use.getPayout(f.userId, "prop_velana")).toEqual(before);
});
