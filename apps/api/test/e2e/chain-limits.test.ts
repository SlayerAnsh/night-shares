import { expect, test } from "bun:test";
import { cost, PRESETS } from "@night-shares/market-model";
import { buildContainer } from "../../src/container/build-container";
import { createSqliteMarketRepo } from "../../src/modules/market/repo/market-repo.sqlite";
import { releaseAtCutoff } from "../../src/modules/market/use-cases/release-at-cutoff";
import { configureChainStatus } from "../../src/ports/chain-status/chain-status";
import { createMockChainStatus } from "../../src/ports/chain-status/chain-status.mock";
import { addDays } from "../../src/shared/dates";
import { createHarness } from "./harness";

test("mainnet host limits reject F 1.2, pool 51 and twenty-first open; accept valid nights", async () => {
  const h = await createHarness(
    buildContainer({
      port: 0,
      adapters: "mock",
      chainLimits: "mainnet",
      dbPath: ":memory:",
      today: "2026-12-01",
      clock: "mock",
    }),
  );
  try {
    const host = await h.signIn("orb", "host");
    const { ports } = h.container;
    const selection = {
      propertyId: "prop_velana",
      roomTypeIds: ["rt_velana_0"],
      dates: ["2026-12-24"],
      allotmentPercent: 100,
      demandPreset: 3,
      releasePolicy: 1,
    };
    const key = "prop_velana:rt_velana_0:2026-12-24";
    const seed = (key: string, F: number) =>
      ports.inventory.update(key, (r) => ({
        ...r,
        openedAt: 0,
        state: { ...r.state, F, q: 0, held: 0, booked: 0, traderAsks: [] },
      }));
    seed(key, 1.2);
    await expect(host.clients.host.openNights({ selection })).rejects.toThrow(
      "Floor price 1.20 USDC is above the 1.00 USDC mainnet limit.",
    );
    const getProperty = ports.catalog.get;
    ports.catalog.get = (id) => {
      const p = getProperty(id);
      return p ? { ...p, rooms: 84 } : p;
    };
    seed(key, 51 / cost(1, PRESETS.peak, 42, 0, 42));
    await expect(host.clients.host.openNights({ selection })).rejects.toThrow(
      "50.00 USDC mainnet limit",
    );
    for (let i = 0; i < 21; i++) {
      const date = addDays("2026-12-24", i);
      seed(`prop_velana:rt_velana_0:${date}`, 0.01);
      selection.dates = [date];
      if (i < 20)
        expect(
          (await host.clients.host.openNights({ selection })).nights,
        ).toHaveLength(1);
      else
        await expect(
          host.clients.host.openNights({ selection }),
        ).rejects.toThrow("Open nights 21 is above the 20 mainnet limit.");
    }
  } finally {
    await h.close();
  }
});
test("ten USDC checkpoint threshold, paused buys and available cutoff claims", async () => {
  const h = await createHarness();
  try {
    const { clients, user } = await h.signInAs("orb", "trader");
    const { ports } = h.container;
    const status = createMockChainStatus();
    configureChainStatus(ports, status, true);
    const night = {
      propertyId: "prop_velana",
      roomTypeId: "rt_velana_0",
      date: "2026-12-20",
    };
    const key = `${night.propertyId}:${night.roomTypeId}:${night.date}`;
    await clients.market.fundAgentWallet({
      amount: { micros: 10_000_000_000n },
    });
    await clients.market.setAgentBudget({
      totalBudget: { micros: 10_000_000_000n },
      perOrderCap: { micros: 10_000_000_000n },
    });
    const order = await clients.market.createAgentOrder({
      night,
      size: { tenths: 1 },
      budget: { micros: 10_000_000_000n },
    });
    expect(order.order?.requiresVerification).toBe(true);
    await clients.market.buy({
      night,
      size: { tenths: 1 },
      maxTotal: { micros: 1_000_000_000n },
    });
    status.setPaused(true);
    expect((await clients.market.getNight({ night })).tradingPaused).toBe(true);
    await expect(
      clients.market.buy({
        night,
        size: { tenths: 1 },
        maxTotal: { micros: 1_000_000_000n },
      }),
    ).rejects.toThrow("Trading is paused.");
    ports.inventory.update(key, (r) => ({ ...r, cutoffAt: ports.clock.now() }));
    await releaseAtCutoff({ ports, repo: createSqliteMarketRepo(ports.db) });
    const balance = await ports.walletProvider.balance(user.walletAddress);
    expect((await clients.market.claimCutoff({ night })).alreadyClaimed).toBe(
      false,
    );
    expect(
      await ports.walletProvider.balance(user.walletAddress),
    ).toBeGreaterThan(balance);
  } finally {
    await h.close();
  }
});
