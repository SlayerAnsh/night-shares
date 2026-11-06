import { expect, test } from "bun:test";
import { cost, PRESETS } from "@night-shares/market-model";
import { configureChainStatus } from "../../../../ports/chain-status/chain-status";
import { createMockChainStatus } from "../../../../ports/chain-status/chain-status.mock";
import { addDays } from "../../../../shared/dates";
import { createSqliteMarketRepo } from "../../../market/repo/market-repo.sqlite";
import { releaseAtCutoff } from "../../../market/use-cases/release-at-cutoff";
import { assertChainPrices } from "../../chain-limits";
import { fixture } from "../fixture";

function setup() {
  const d = fixture();
  configureChainStatus(d.ports, createMockChainStatus(), true);
  d.ports.inventory.update(d.key, (r) => ({
    ...r,
    openedAt: 0,
    state: { ...r.state, F: 0.01, q: 0, held: 0, booked: 0, traderAsks: [] },
  }));
  return d;
}
test("floor and full tick-snapped pool errors report computed value and mainnet limit", async () => {
  const d = setup();
  try {
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      state: { ...r.state, F: 1.2 },
    }));
    expect(() => d.use.openNights(d.userId, d.selection)).toThrow(
      "Floor price 1.20 USDC is above the 1.00 USDC mainnet limit.",
    );
    expect(() => assertChainPrices({ F: 1, k: 0, S: 51 })).toThrow(
      "Full ladder cost 51.00 USDC is above the 50.00 USDC mainnet limit.",
    );
    const getProperty = d.ports.catalog.get;
    d.ports.catalog.get = (id) => {
      const p = getProperty(id);
      return p ? { ...p, rooms: 84 } : p;
    };
    const F = 51 / cost(1, PRESETS.peak, 42, 0, 42);
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      state: { ...r.state, F },
    }));
    expect(() => d.use.openNights(d.userId, d.selection)).toThrow(
      "50.00 USDC mainnet limit",
    );
    expect(d.ports.inventory.get(d.key).openedAt).toBe(0);
  } finally {
    d.ports.db.close();
  }
});
test("platform allows twenty confirmed opens, rejects twenty-first without counting discovered inventory", async () => {
  const d = setup();
  try {
    for (let i = 0; i < 21; i++) {
      const date = addDays("2026-12-24", i);
      const key = `prop_velana:rt_velana_0:${date}`;
      d.ports.inventory.update(key, (r) => ({
        ...r,
        openedAt: 0,
        state: {
          ...r.state,
          F: 0.01,
          q: 0,
          held: 0,
          booked: 0,
          traderAsks: [],
        },
      }));
      d.selection.dates = [date];
      if (i < 20) await d.use.openNights(d.userId, d.selection);
      else
        expect(() => d.use.openNights(d.userId, d.selection)).toThrow(
          "Open nights 21 is above the 20 mainnet limit.",
        );
    }
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      cutoffAt: d.ports.clock.now(),
    }));
    await releaseAtCutoff({
      ports: d.ports,
      repo: createSqliteMarketRepo(d.ports.db),
    });
    await d.use.openNights(d.userId, d.selection);
  } finally {
    d.ports.db.close();
  }
});
test("pending opening reserves the final slot and failed channel push restores it", async () => {
  const d = setup();
  try {
    for (let i = 0; i < 19; i++)
      d.ports.db
        .query("INSERT INTO host_pool_positions VALUES (?, 'night_vault', 10)")
        .run(`prop_velana:rt_velana_0:${addDays("2026-12-01", i)}`);
    let reject = (_error: Error) => {};
    d.ports.channelManager.pushInventory = () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      });
    const opening = d.use.openNights(d.userId, d.selection);
    const date = "2026-12-25";
    const key = `prop_velana:rt_velana_0:${date}`;
    d.ports.inventory.update(key, (r) => ({
      ...r,
      openedAt: 0,
      state: { ...r.state, F: 0.01, held: 0, booked: 0 },
    }));
    expect(() =>
      d.use.openNights(d.userId, { ...d.selection, dates: [date] }),
    ).toThrow("Open nights 21");
    reject(new Error("Channel unavailable"));
    await expect(opening).rejects.toThrow("Nothing changed");
    d.ports.channelManager.pushInventory = async () => {};
    await d.use.openNights(d.userId, { ...d.selection, dates: [date] });
  } finally {
    d.ports.db.close();
  }
});
