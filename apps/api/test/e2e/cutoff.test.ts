import { expect, test } from "bun:test";
import { cutoffRefund, toMicros } from "@night-shares/market-model";
import { createJobRegistry } from "../../src/jobs/registry";
import { createJobRunner } from "../../src/jobs/runner";
import { cutoffAt } from "../../src/modules/market/cutoff";
import { cutoffClaims } from "../../src/modules/market/repo/cutoff-claims";
import type { MockClock } from "../../src/ports/clock/clock.mock";
import { SYSTEM_ADDRESSES } from "../../src/ports/wallet-provider/wallet-provider";
import { mulTenths } from "../../src/shared/money";
import { createHarness } from "./harness";

test("clock-driven cutoff releases holdings through the job registry", async () => {
  const h = await createHarness();
  try {
    const { clients, user } = await h.signInAs("orb", "cutoff_holder");
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
    const holdings = (await clients.market.getPortfolio({})).holdings;
    expect(holdings).toHaveLength(1);
    const size = holdings[0]?.size?.tenths;
    if (size === undefined) throw new Error("Missing holding size");
    const refund = mulTenths(
      toMicros(cutoffRefund(ports.inventory.get(key).state).perNight),
      size,
    );
    expect(refund).toBeGreaterThan(0n);
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
    expect(afterCutoff.balance?.micros).toBe(
      (balance.balance?.micros ?? 0n) + refund,
    );
    expect(afterCutoff.walletAddress).toBe(balance.walletAddress);
    const names = Object.values(SYSTEM_ADDRESSES).sort();
    expect(balance.systemWallets.map((wallet) => wallet.name)).toEqual(names);
    expect(afterCutoff.systemWallets.map((wallet) => wallet.name)).toEqual(
      names,
    );
    const entitlements = cutoffClaims(ports.db, user.humanId);
    expect(entitlements).toHaveLength(1);
    expect(entitlements[0]?.amount).toBe(refund);
    expect(entitlements[0]?.claimed_at).toBe(BigInt(ports.clock.now()));
    expect(
      ports.activity.list({ nightKey: key, kinds: ["cutoff_pushed"] }),
    ).toHaveLength(1);
    const { claims } = await clients.market.listCutoffClaims({});
    expect(claims).toHaveLength(1);
    expect(claims[0]?.claimedAt).toBeDefined();
    expect(
      (await clients.market.getPortfolio({})).unclaimedCutoff?.micros,
    ).toBe(0n);
    expect((await clients.market.getPortfolio({})).holdings).toEqual([]);
    expect(
      ports.activity.list({ nightKey: key, kinds: ["night_released"] }),
    ).toHaveLength(1);
    await runner.tick();
    expect((await clients.wallet.getBalance({})).balance).toEqual(
      afterCutoff.balance,
    );
    expect(
      ports.activity.list({ nightKey: key, kinds: ["cutoff_pushed"] }),
    ).toHaveLength(1);
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
