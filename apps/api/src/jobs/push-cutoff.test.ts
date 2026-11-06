import { expect, test } from "bun:test";
import { fixture } from "../modules/market/testing/fixture";
import { claimCutoff } from "../modules/market/use-cases/account/claim-cutoff";
import { releaseAtCutoff } from "../modules/market/use-cases/release-at-cutoff";
import { pushCutoff } from "./push-cutoff";

async function setup(count: number) {
  const d = await fixture();
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = {
      id: `usr_${i}`,
      humanId: `human_${i}`,
      level: "orb" as const,
      walletAddress: await d.ports.walletProvider.linkWallet(`human_${i}`),
    };
    d.repo.remember(user);
    d.repo.position(user.humanId, d.key).free = 1;
    users.push(user);
  }
  d.ports.inventory.update(d.key, (r) => ({
    ...r,
    cutoffAt: d.ports.clock.now(),
    state: {
      ...r.state,
      S: 100,
      q: count / 10,
      held: count / 10,
      booked: 0,
      traderAsks: [],
    },
  }));
  await releaseAtCutoff(d);
  const first = users[0];
  if (!first) throw new Error("Missing holder");
  return { ...d, users, first };
}
test("cutoff pushes 150 holders across ticks in batches of at most 100", async () => {
  const d = await setup(150);
  try {
    const settle = d.ports.walletProvider.settle;
    const batches: number[] = [];
    d.ports.walletProvider.settle = async (legs) => {
      batches.push(legs.length);
      return settle(legs);
    };
    await pushCutoff(d);
    expect(
      d.ports.db
        .query(
          "SELECT COUNT(*) AS n FROM market_cutoff_claims WHERE claimed_at IS NOT NULL",
        )
        .get(),
    ).toEqual({ n: 100n });
    await pushCutoff(d);
    await pushCutoff(d);
    expect(batches).toEqual([100, 50]);
    expect(
      d.ports.db
        .query(
          "SELECT COUNT(*) AS n FROM market_cutoff_claims WHERE claimed_at IS NOT NULL",
        )
        .get(),
    ).toEqual({ n: 150n });
    for (const user of d.users)
      expect(
        await d.ports.walletProvider.balance(user.walletAddress),
      ).toBeGreaterThan(12_480_000_000n);
    expect(
      d.ports.activity.list({ kinds: ["cutoff_pushed"], limit: 200 }),
    ).toHaveLength(150);
    expect((await claimCutoff(d, d.first, d.key)).alreadyClaimed).toBe(true);
    expect(batches).toEqual([100, 50]);
  } finally {
    d.ports.db.close();
  }
});
test("failed push compensates, remains claimable, and later push skips claimed holders", async () => {
  const d = await setup(2);
  try {
    const settle = d.ports.walletProvider.settle;
    d.ports.walletProvider.settle = async () => {
      throw new Error("Settlement failed");
    };
    await expect(pushCutoff(d)).rejects.toThrow("Cutoff pushes failed");
    expect(
      d.ports.db
        .query(
          "SELECT COUNT(*) AS n FROM market_cutoff_claims WHERE claimed_at IS NULL AND busy = 0",
        )
        .get(),
    ).toEqual({ n: 2n });
    d.ports.walletProvider.settle = settle;
    await claimCutoff(d, d.first, d.key);
    await pushCutoff(d);
    expect(d.ports.activity.list({ kinds: ["cutoff_pushed"] })).toHaveLength(1);
    expect(d.ports.activity.list({ kinds: ["cutoff_claimed"] })).toHaveLength(
      1,
    );
  } finally {
    d.ports.db.close();
  }
});
test("in-flight push excludes concurrent claim and push", async () => {
  const d = await setup(1);
  try {
    const settle = d.ports.walletProvider.settle;
    let finish = () => {};
    d.ports.walletProvider.settle = async (legs) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return settle(legs);
    };
    const pushing = pushCutoff(d);
    await expect(claimCutoff(d, d.first, d.key)).rejects.toThrow("settling");
    await pushCutoff(d);
    finish();
    await pushing;
    expect((await claimCutoff(d, d.first, d.key)).alreadyClaimed).toBe(true);
  } finally {
    d.ports.db.close();
  }
});
