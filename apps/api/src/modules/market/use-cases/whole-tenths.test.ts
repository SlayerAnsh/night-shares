import { expect, test } from "bun:test";
import type { MockClock } from "../../../ports/clock/clock.mock";
import { toWholeTenths } from "../../../shared/tenths";
import { cutoffAt } from "../cutoff";
import { fixture } from "../testing/fixture";
import { recallTenths } from "../testing/recall-tenths";
import { postAsk } from "./account/post-ask";
import { releaseAtCutoff } from "./release-at-cutoff";
import { buy } from "./trading/buy";
import { sell } from "./trading/sell";

test("recall spans odd-size holders and cutoff releases exact remaining tenths", async () => {
  const d = await fixture();
  try {
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      state: { ...r.state, S: 100, q: 0, held: 0, booked: 0, traderAsks: [] },
    }));
    const users = [];
    for (const [index, size] of [3, 7, 5].entries()) {
      const user = {
        ...d.user,
        humanId: `holder_${index}`,
        walletAddress: await d.ports.walletProvider.linkWallet(
          `holder_${index}`,
        ),
      };
      users.push(user);
      await buy(d, user, d.key, size, 10n ** 12n);
    }
    recallTenths(d, d.key, 11);
    expect(users.map((u) => d.repo.position(u.humanId, d.key).free)).toEqual([
      3, 0, 1,
    ]);
    expect(toWholeTenths(d.ports.inventory.get(d.key).state.held)).toBe(4);
    (d.ports.clock as MockClock).set(
      cutoffAt(d.ports, d.ports.inventory.get(d.key)),
    );
    await releaseAtCutoff(d);
    for (const u of users)
      expect(d.repo.position(u.humanId, d.key).free).toBe(0);
    expect(d.ports.inventory.get(d.key).returnedTenths).toBe(989);
  } finally {
    d.ports.db.close();
  }
});

test("seeded random buy sell ask recall sequences preserve integer positions", async () => {
  for (const seed of [17, 129, 2026]) {
    const d = await fixture();
    try {
      let state = seed;
      const random = (n: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state % n;
      };
      d.ports.inventory.update(d.key, (r) => ({
        ...r,
        state: { ...r.state, S: 100, q: 0, held: 0, booked: 0, traderAsks: [] },
      }));
      const users = await Promise.all(
        [0, 1, 2].map(async (i) => ({
          ...d.user,
          humanId: `random_${i}`,
          walletAddress: await d.ports.walletProvider.linkWallet(`random_${i}`),
        })),
      );
      const counts = [0, 0, 0, 0];
      for (let step = 0; step < 100; step++) {
        const user = users[random(users.length)];
        if (!user) throw new Error("Missing test user");
        const free = d.repo.position(user.humanId, d.key).free;
        const amount = 1 + random(7);
        const action = random(4);
        if (action === 0 && free + amount <= 300)
          await buy(d, user, d.key, amount, 10n ** 12n);
        else if (action === 1 && free)
          await sell(d, user, d.key, Math.min(free, amount), 0n);
        else if (action === 2 && free)
          postAsk(d, user, d.key, Math.min(free, amount), 1000000n);
        else if (
          action === 3 &&
          toWholeTenths(d.ports.inventory.get(d.key).state.held) > 0
        )
          recallTenths(
            d,
            d.key,
            Math.min(
              amount,
              toWholeTenths(d.ports.inventory.get(d.key).state.held),
            ),
          );
        else continue;
        counts[action] = (counts[action] ?? 0) + 1;
        const record = d.ports.inventory.get(d.key);
        let total = 0;
        for (const u of users) {
          const p = d.repo.position(u.humanId, d.key);
          expect(Number.isSafeInteger(p.free)).toBe(true);
          expect(Number.isSafeInteger(p.escrow)).toBe(true);
          expect(p.free).toBeGreaterThanOrEqual(0);
          total += p.free + p.escrow;
        }
        expect(total).toBe(toWholeTenths(record.state.held));
        for (const ask of record.state.traderAsks)
          expect(Number.isSafeInteger(toWholeTenths(ask.size))).toBe(true);
        const rows = d.ports.db
          .query<{ remaining: bigint }, []>(
            "SELECT remaining FROM market_signed_asks",
          )
          .all();
        for (const row of rows)
          expect(Number.isSafeInteger(Number(row.remaining))).toBe(true);
      }
      for (const count of counts) expect(count).toBeGreaterThan(0);
    } finally {
      d.ports.db.close();
    }
  }
});
