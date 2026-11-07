import { expect, test } from "bun:test";
import { decodeEventLog, type Hex } from "viem";
import { buildContainer } from "../../src/container/build-container";
import { seedConfig, seedFork } from "../../src/dev/seed-fork";
import { isolatedHostFork } from "../../src/modules/host/chain/fork-fixture";
import {
  configureChainMarket,
  nightHash,
} from "../../src/modules/market/chain/runtime";
import { forkClient } from "../../src/ports/arc-deployment/validate";
import { fromProto, toProto } from "../../src/shared/night-key";
import { createHarness } from "../e2e/harness";

(process.env.FORK_IT === "1" ? test : test.skip)(
  "web HTTP flow discovers registered nights, buys, and confirms receipt holdings",
  async () => {
    const upstream = process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545";
    const child = await isolatedHostFork(
      upstream,
      Number(await forkClient(upstream).getBlockNumber()),
    );
    let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
    try {
      const config = seedConfig({
        ...process.env,
        ARC_RPC_URL: child.rpcUrl,
        DB_PATH: ":memory:",
        WORLD_ID_MODE: "mock",
      });
      const container = buildContainer(config);
      const deployment = config.arcDeployment;
      const custody = container.ports.walletProvider.custody;
      if (!deployment || !custody)
        throw new Error("Missing fork configuration.");
      const client = forkClient(child.rpcUrl);
      configureChainMarket(container.ports, { client, custody, deployment });
      harness = await createHarness(container);
      const seeded = await seedFork(container);
      expect((await seedFork(container)).nights).toEqual(seeded.nights);
      const signed = await harness.signIn("orb", seeded.trader);
      const market = signed.clients.market;
      container.ports.inventory.seedNight({
        propertyId: "prop_velana",
        roomTypeId: "rt_velana_0",
        date: "2030-01-01",
      });
      const discovered = await market.discover({});
      expect(
        discovered.nights.some((n) => n.night?.date === "2030-01-01"),
      ).toBe(false);
      for (const key of seeded.nights)
        expect(
          discovered.nights.some((n) => n.night && fromProto(n.night) === key),
        ).toBe(true);
      for (const n of discovered.nights) {
        if (!n.night) throw new Error("Missing night identity.");
        expect(
          await container.ports.chainReader?.tokenOf(
            nightHash(fromProto(n.night)),
          ),
        ).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }
      const key = seeded.nights[0];
      if (!key) throw new Error("Missing seeded night.");
      const night = toProto(key);
      const detail = await market.getNight({ night });
      expect(detail.priceHistory).toHaveLength(0);
      expect(detail.monthCalendar).toHaveLength(3);
      await market.getBook({ night });
      const draft = toProto(
        `${night.propertyId}:${night.roomTypeId}:2030-01-01`,
      );
      await expect(market.getNight({ night: draft })).rejects.toThrow(
        "Night is not open on chain.",
      );
      const quote = await market.quoteBuy({ night, size: { tenths: 1 } });
      expect(quote.quote?.filled?.tenths).toBe(1);
      const request = {
        night,
        size: { tenths: 1 },
        maxTotal: { micros: (quote.quote?.total?.micros ?? 0n) * 2n + 100n },
      };
      const options = { headers: { "idempotency-key": "web-click" } };
      const bought = await market.buy(request, options);
      const hash = bought.execution?.transactionHash as Hex;
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(
        (await market.buy(request, options)).execution?.transactionHash,
      ).toBe(hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
      console.info(`web-flow confirmed transaction_hash=${hash}`);
      const trades = receipt.logs.flatMap((log) => {
        const contract = ["TradeRouter", "NightHook"] as const;
        const name = contract.find(
          (name) =>
            deployment[name].toLowerCase() === log.address.toLowerCase(),
        );
        if (!name) return [];
        try {
          const event = decodeEventLog({
            abi: deployment.abis[name] ?? [],
            data: log.data,
            topics: log.topics,
          });
          return event.eventName === "Trade"
            ? [
                event.args as unknown as {
                  night: Hex;
                  taker: string;
                  qty: bigint;
                },
              ]
            : [];
        } catch {
          return [];
        }
      });
      expect(trades.length).toBeGreaterThan(0);
      expect(
        trades.every(
          (t) =>
            t.night === nightHash(key) &&
            t.taker.toLowerCase() === seeded.wallet.toLowerCase(),
        ),
      ).toBe(true);
      const quantity = trades.reduce((sum, t) => sum + t.qty, 0n);
      const portfolio = await market.getPortfolio({});
      expect(
        portfolio.holdings.find((h) => h.night && fromProto(h.night) === key)
          ?.size?.tenths,
      ).toBe(Number(quantity / 100000000000000000n));
    } finally {
      await harness?.close();
      child.stop();
    }
  },
  300000,
);
