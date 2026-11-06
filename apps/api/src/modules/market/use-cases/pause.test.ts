import { expect, test } from "bun:test";
import { configureChainStatus } from "../../../ports/chain-status/chain-status";
import { createMockChainStatus } from "../../../ports/chain-status/chain-status.mock";
import { commitNights } from "../../stay/use-cases/booking/commit-nights";
import { fixture } from "../testing/fixture";
import { claimCutoff } from "./account/claim-cutoff";
import { createAgentOrder } from "./account/create-agent-order";
import { fundFixtureAgent } from "./agent/testing";
import { getBook } from "./queries/get-book";
import { getNight } from "./queries/get-night";
import { releaseAtCutoff } from "./release-at-cutoff";
import { buy } from "./trading/buy";
import { sell } from "./trading/sell";

test("pause blocks buys, sells and every guest route but leaves cutoff and claim available", async () => {
  const d = await fixture();
  const status = createMockChainStatus();
  configureChainStatus(d.ports, status);
  try {
    await buy(d, d.user, d.key, 1, 10_000_000_000n);
    status.setPaused(true);
    expect(getNight(d, d.key).tradingPaused).toBe(true);
    expect(getBook(d, d.key).tradingPaused).toBe(true);
    await expect(buy(d, d.user, d.key, 1, 10_000_000_000n)).rejects.toThrow(
      "Trading is paused.",
    );
    await expect(sell(d, d.user, d.key, 1, 0n)).rejects.toThrow(
      "Trading is paused.",
    );
    expect(() =>
      commitNights(
        d.ports,
        [
          {
            key: d.key,
            route: {
              fills: [],
              filled: 0,
              avg: 0,
              gross: 0,
              total: 0,
              fee: 0,
              sellerFees: 0,
              sellerNet: 0,
            },
          },
        ],
        1,
        d.night.propertyId,
        d.user.id,
      ),
    ).toThrow("Trading is paused.");
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      cutoffAt: d.ports.clock.now(),
    }));
    await releaseAtCutoff(d);
    expect((await claimCutoff(d, d.user, d.key)).alreadyClaimed).toBe(false);
  } finally {
    d.ports.db.close();
  }
});
test("mainnet agent order above ten USDC requires a checkpoint", async () => {
  const d = await fixture();
  try {
    configureChainStatus(d.ports, createMockChainStatus(), true);
    await fundFixtureAgent(d);
    const { order } = await createAgentOrder(
      d,
      d.user,
      d.key,
      1,
      10_000_000_000n,
    );
    expect(order.requiresVerification).toBe(true);
    expect(order.spent?.micros).toBe(0n);
  } finally {
    d.ports.db.close();
  }
});
