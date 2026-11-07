import { expect, test } from "bun:test";
import { cutoffRefund, hostPayout, toMicros } from "@night-shares/market-model";
import type { MockClock } from "../../../ports/clock/clock.mock";
import { mulTenths } from "../../../shared/money";
import { cutoffAt } from "../cutoff";
import { createSqliteMarketRepo } from "../repo/market-repo.sqlite";
import { fixture } from "../testing/fixture";
import { claimCutoff, listCutoffClaims } from "./account/claim-cutoff";
import { getPortfolio } from "./account/get-portfolio";
import { postAsk } from "./account/post-ask";
import { releaseAtCutoff } from "./release-at-cutoff";
import { buy } from "./trading/buy";
import { sell } from "./trading/sell";

async function setup() {
  const f = await fixture();
  const d = { ...f, repo: createSqliteMarketRepo(f.ports.db) };
  d.ports.inventory.update(d.key, (r) => ({
    ...r,
    state: { ...r.state, S: 10, q: 2, held: 1, booked: 1, traderAsks: [] },
  }));
  await buy(d, d.user, d.key, 10, 10n ** 12n);
  const other = {
    ...d.user,
    id: "usr_other",
    humanId: "human_other",
    walletAddress: await d.ports.walletProvider.linkWallet("human_other"),
  };
  await buy(d, other, d.key, 3, 10n ** 12n);
  postAsk(d, d.user, d.key, 5, 999_000_000_000n);
  const before = d.ports.inventory.get(d.key);
  (d.ports.clock as MockClock).set(cutoffAt(d.ports, before));
  return { ...d, other, before };
}
test("cutoff snapshots the same bid per holder, returns inventory and reruns idempotently", async () => {
  const d = await setup();
  const balance = await d.ports.walletProvider.balance(d.user.walletAddress);
  const otherBalance = await d.ports.walletProvider.balance(
    d.other.walletAddress,
  );
  const rebateBefore = await d.ports.walletProvider.balance("rebate_pool");
  const perNight = toMicros(cutoffRefund(d.before.state).perNight);
  await releaseAtCutoff(d);
  expect(await d.ports.walletProvider.balance(d.user.walletAddress)).toBe(
    balance,
  );
  expect(await d.ports.walletProvider.balance(d.other.walletAddress)).toBe(
    otherBalance,
  );
  expect(await d.ports.walletProvider.balance("rebate_pool")).toBe(
    rebateBefore + toMicros(cutoffRefund(d.before.state).haircut),
  );
  expect((await listCutoffClaims(d, d.other)).claims[0]?.amount?.micros).toBe(
    mulTenths(perNight, 3),
  );
  expect(getPortfolio(d, d.user).unclaimedCutoff?.micros).toBe(perNight);
  const released = d.ports.inventory.get(d.key);
  expect(released).toMatchObject({
    released: true,
    stopped: true,
    returnedTenths: Math.round((d.before.state.S - d.before.state.booked) * 10),
  });
  expect(released.state.held).toBe(0);
  expect(released.state.traderAsks).toEqual([]);
  expect(hostPayout(released.state).availableNow).toBeCloseTo(
    hostPayout(d.before.state).gross - (released.state.cutoffPaid ?? 0),
    6,
  );
  expect(getPortfolio(d, d.user).holdings).toEqual([]);
  expect(d.repo.position(d.user.humanId, d.key).closed).toBe(0);
  const events = d.ports.activity.list({ nightKey: d.key });
  await releaseAtCutoff(d);
  expect(d.ports.activity.list({ nightKey: d.key })).toEqual(events);
  expect(await d.ports.walletProvider.balance(d.user.walletAddress)).toBe(
    balance,
  );
  const claim = await claimCutoff(d, d.user, d.key);
  expect(claim.alreadyClaimed).toBe(false);
  expect(await d.ports.walletProvider.balance(d.user.walletAddress)).toBe(
    balance + perNight,
  );
  expect((await claimCutoff(d, d.user, d.key)).alreadyClaimed).toBe(true);
  expect(await d.ports.walletProvider.balance(d.user.walletAddress)).toBe(
    balance + perNight,
  );
  expect(getPortfolio(d, d.user).unclaimedCutoff?.micros).toBe(0n);
  expect(d.repo.position(d.user.humanId, d.key).closed).toBe(1);
  d.ports.db.close();
});
test("failed cutoff settlement restores inventory and positions, then retries", async () => {
  const d = await setup();
  const previous = { ...d.repo.position(d.user.humanId, d.key) };
  const settle = d.ports.walletProvider.settle;
  d.ports.walletProvider.settle = async () => {
    throw new Error("settlement unavailable");
  };
  await expect(releaseAtCutoff(d)).rejects.toThrow("settlement unavailable");
  expect((await listCutoffClaims(d, d.user)).claims).toEqual([]);
  expect(d.ports.inventory.get(d.key)).toEqual(d.before);
  expect({ ...d.repo.position(d.user.humanId, d.key) }).toEqual(previous);
  expect(
    d.ports.activity.list({ kinds: ["night_released", "cutoff_refund"] }),
  ).toEqual([]);
  d.ports.walletProvider.settle = settle;
  await releaseAtCutoff(d);
  expect(d.ports.inventory.get(d.key).released).toBe(true);
  d.ports.db.close();
});
test("released nights reject buying, selling and posting asks", async () => {
  const d = await setup();
  await releaseAtCutoff(d);
  await expect(buy(d, d.user, d.key, 1, 10n ** 12n)).rejects.toThrow(
    "This night has closed.",
  );
  await expect(sell(d, d.user, d.key, 1, 0n)).rejects.toThrow(
    "This night has closed.",
  );
  expect(() => postAsk(d, d.user, d.key, 1, 1n)).toThrow(
    "This night has closed.",
  );
  d.ports.db.close();
});
test("stored host release policy controls the absolute cutoff", async () => {
  const d = await fixture();
  const record = d.ports.inventory.get(d.key);
  const arrival = cutoffAt(d.ports, record);
  d.ports.db.query("INSERT INTO host_releases VALUES (?, ?)").run(d.key, 2);
  expect(cutoffAt(d.ports, record)).toBe(arrival - 20 * 3_600_000);
  d.ports.db
    .query("UPDATE host_releases SET release_policy = 3 WHERE night_key = ?")
    .run(d.key);
  expect(cutoffAt(d.ports, record)).toBe(arrival - 74 * 3_600_000);
  d.ports.db.close();
});

test("cutoff waits for a trade reservation before settling its holdings", async () => {
  const f = await fixture();
  const d = { ...f, repo: createSqliteMarketRepo(f.ports.db) };
  const settle = d.ports.walletProvider.settle;
  let finish = () => {};
  d.ports.walletProvider.settle = async (legs) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return settle(legs);
  };
  const pending = buy(d, d.user, d.key, 5, 10n ** 12n);
  (d.ports.clock as MockClock).set(
    cutoffAt(d.ports, d.ports.inventory.get(d.key)),
  );
  await releaseAtCutoff(d);
  expect(d.ports.inventory.get(d.key).released).not.toBe(true);
  finish();
  await pending;
  d.ports.walletProvider.settle = settle;
  await releaseAtCutoff(d);
  expect(d.ports.inventory.get(d.key).released).toBe(true);
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
  d.ports.db.close();
});

test("claim failure retries and concurrent claims cannot pay twice", async () => {
  const d = await setup();
  await releaseAtCutoff(d);
  const settle = d.ports.walletProvider.settle;
  d.ports.walletProvider.settle = async () => {
    throw new Error("unavailable");
  };
  await expect(claimCutoff(d, d.user, d.key)).rejects.toThrow("unavailable");
  expect(
    (await listCutoffClaims(d, d.user)).claims[0]?.claimedAt,
  ).toBeUndefined();
  let finish = () => {};
  d.ports.walletProvider.settle = async (legs) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return settle(legs);
  };
  const pending = claimCutoff(d, d.user, d.key);
  await expect(claimCutoff(d, d.user, d.key)).rejects.toThrow("settling");
  finish();
  await pending;
  expect(
    (await listCutoffClaims(d, d.user)).claims[0]?.claimedAt,
  ).toBeDefined();
  d.ports.db.close();
});

test("claims stay unavailable until escrow settlement succeeds", async () => {
  const d = await setup();
  const settle = d.ports.walletProvider.settle;
  let finish = () => {};
  d.ports.walletProvider.settle = async (legs) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return settle(legs);
  };
  const pending = releaseAtCutoff(d);
  expect((await listCutoffClaims(d, d.user)).claims).toEqual([]);
  await expect(claimCutoff(d, d.user, d.key)).rejects.toThrow(
    "No cutoff claim",
  );
  finish();
  await pending;
  d.ports.walletProvider.settle = settle;
  const reopened = { ...d, repo: createSqliteMarketRepo(d.ports.db) };
  expect((await listCutoffClaims(reopened, d.user)).claims).toHaveLength(1);
  await expect(
    claimCutoff(reopened, { ...d.user, humanId: "stranger" }, d.key),
  ).rejects.toThrow("No cutoff claim");
  expect((await claimCutoff(reopened, d.user, d.key)).alreadyClaimed).toBe(
    false,
  );
  expect((await claimCutoff(d, d.user, d.key)).alreadyClaimed).toBe(true);
  d.ports.db.close();
});
