import { expect, test } from "bun:test";
import { createJobRegistry } from "../../src/jobs/registry";
import { createJobRunner } from "../../src/jobs/runner";
import { cutoffAt } from "../../src/modules/market/cutoff";
import type { MockClock } from "../../src/ports/clock/clock.mock";
import { SYSTEM_ADDRESSES } from "../../src/ports/wallet-provider/wallet-provider";
import { createHarness } from "./harness";

test("clock-driven cutoff releases holdings through the job registry", async () => {
  const h = await createHarness();
  try {
    const { clients } = await h.signInAs("orb", "cutoff_holder");
    const night = {
      propertyId: "prop_velana",
      roomTypeId: "rt_velana_0",
      date: "2026-12-01",
    };
    await clients.market.buy({
      night,
      size: { tenths: 5 },
      maxTotal: { micros: 10n ** 12n },
    });
    const balance = await clients.wallet.getBalance({});
    const { ports } = h.container;
    const key = `${night.propertyId}:${night.roomTypeId}:${night.date}`;
    (ports.clock as MockClock).set(
      cutoffAt(ports, ports.inventory.get(key)) + 1,
    );
    const runner = createJobRunner({
      clock: ports.clock,
      intervalMs: 60000,
      jobs: createJobRegistry(ports),
      onError: () => {},
    });
    await runner.tick();
    const afterCutoff = await clients.wallet.getBalance({});
    expect(afterCutoff.balance).toEqual(balance.balance);
    expect(afterCutoff.walletAddress).toBe(balance.walletAddress);
    const names = Object.values(SYSTEM_ADDRESSES).sort();
    expect(balance.systemWallets.map((wallet) => wallet.name)).toEqual(names);
    expect(afterCutoff.systemWallets.map((wallet) => wallet.name)).toEqual(
      names,
    );
    const claims = await clients.market.listCutoffClaims({});
    expect(claims.claims).toHaveLength(1);
    expect(claims.claims[0]?.claimedAt).toBeUndefined();
    expect(
      (await clients.market.getPortfolio({})).unclaimedCutoff?.micros,
    ).toBe(claims.claims[0]?.amount?.micros);
    expect((await clients.market.claimCutoff({ night })).alreadyClaimed).toBe(
      false,
    );
    const paid = await clients.wallet.getBalance({});
    expect(paid.balance?.micros).toBe(
      (balance.balance?.micros ?? 0n) +
        (claims.claims[0]?.amount?.micros ?? 0n),
    );
    expect((await clients.market.claimCutoff({ night })).alreadyClaimed).toBe(
      true,
    );
    expect((await clients.wallet.getBalance({})).balance).toEqual(paid.balance);
    expect(
      (await clients.market.listCutoffClaims({})).claims[0]?.claimedAt,
    ).toBeDefined();
    expect((await clients.market.getPortfolio({})).holdings).toEqual([]);
    expect(
      ports.activity.list({ nightKey: key, kinds: ["night_released"] }),
    ).toHaveLength(1);
    await runner.tick();
    expect(
      ports.activity.list({ nightKey: key, kinds: ["night_released"] }),
    ).toHaveLength(1);
    await expect(
      clients.market.buy({
        night,
        size: { tenths: 1 },
        maxTotal: { micros: 10n ** 12n },
      }),
    ).rejects.toThrow("This night has closed.");
  } finally {
    await h.close();
  }
});
