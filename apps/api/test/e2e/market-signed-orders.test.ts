import { expect, test } from "bun:test";
import { timestampFromMs, timestampMs } from "@bufbuild/protobuf/wkt";
import { Code } from "@connectrpc/connect";
import { createMockOrderSigner } from "../../src/ports/order-signer/order-signer.mock";
import {
  maxTotal,
  signedNight as night,
  signedFixture,
} from "./market-signed-fixture";

const request = { night, size: { tenths: 5 }, price: { micros: 1000000n } };

test("custodial and explicit signatures post without escrow; cancel all rejects stale nonce", async () => {
  const { h, market, maker } = await signedFixture();
  try {
    const custodial = await market.postAsk(request);
    expect(custodial.ask?.maker).toBe(maker.user.walletAddress);
    if (!custodial.ask?.expiry) throw new Error("Missing ask expiry");
    expect(timestampMs(custodial.ask.expiry)).toBe(
      h.container.ports.clock.now() + 86400000,
    );
    expect((await market.getPortfolio({})).holdings[0]?.size?.tenths).toBe(5);
    const prepared = await market.prepareAsk(request);
    expect(JSON.parse(prepared.typedDataJson).primaryType).toBe("Order");
    const signature = createMockOrderSigner().signCustodial(
      maker.user.walletAddress,
      prepared.digest,
    );
    const explicit = {
      ...request,
      expiry: prepared.order?.expiry,
      nonce: prepared.order?.nonce,
      signature,
    };
    expect((await market.postAsk(explicit)).ask?.digest).toBe(prepared.digest);
    expect(await market.cancelAllAsks({})).toMatchObject({
      nonce: 1n,
      cancelledCount: 1,
    });
    await expect(market.postAsk(explicit)).rejects.toMatchObject({
      code: Code.FailedPrecondition,
    });
    expect(
      (await market.getBook({ night })).asks.some(
        (a) => a.askId === prepared.order?.id,
      ),
    ).toBe(false);
    expect((await market.prepareAsk(request)).order?.nonce).toBe(1n);
  } finally {
    await h.close();
  }
});
test("bad and tampered signatures reject without posting", async () => {
  const { h, market, maker } = await signedFixture();
  try {
    const prepared = await market.prepareAsk(request);
    const signed = {
      ...request,
      expiry: prepared.order?.expiry,
      nonce: prepared.order?.nonce,
      signature: "mock:bad",
    };
    await expect(market.postAsk(signed)).rejects.toMatchObject({
      code: Code.InvalidArgument,
    });
    signed.signature = createMockOrderSigner().signCustodial(
      maker.user.walletAddress,
      prepared.digest,
    );
    await expect(
      market.postAsk({ ...signed, price: { micros: 2n } }),
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
    expect((await market.getPortfolio({})).listings).toHaveLength(0);
  } finally {
    await h.close();
  }
});
test("expired ask is absent from book and quotes and never fills before expiry cleanup", async () => {
  const { h, market, buyer } = await signedFixture();
  try {
    const now = h.container.ports.clock.now();
    const ask = (
      await market.postAsk({ ...request, expiry: timestampFromMs(now + 1000) })
    ).ask;
    h.container.ports.clock = {
      now: () => now + 1000,
      today: () => "2026-12-01",
    };
    expect(
      (await market.getBook({ night })).asks.some((a) => a.askId === ask?.id),
    ).toBe(false);
    const quote = await buyer.clients.market.quoteBuy({
      night,
      size: { tenths: 1 },
    });
    expect(quote.quote?.fills.some((f) => f.askId === ask?.id)).toBe(false);
    const fill = await buyer.clients.market.buy({
      night,
      size: { tenths: 1 },
      maxTotal,
    });
    expect(fill.execution?.quote?.fills.some((f) => f.askId === ask?.id)).toBe(
      false,
    );
    expect((await market.getPortfolio({})).holdings[0]?.size?.tenths).toBe(5);
  } finally {
    await h.close();
  }
});
for (const sold of [3, 5]) {
  test(`ask fills only remaining holding after maker sells ${sold} tenths`, async () => {
    const { h, market, buyer } = await signedFixture();
    try {
      const ask = (await market.postAsk(request)).ask;
      await market.sell({
        night,
        size: { tenths: sold },
        minTotal: { micros: 0n },
      });
      const fill = await buyer.clients.market.buy({
        night,
        size: { tenths: 5 },
        maxTotal,
      });
      expect(
        fill.execution?.quote?.fills
          .filter((f) => f.askId === ask?.id)
          .reduce((n, f) => n + (f.size?.tenths ?? 0), 0),
      ).toBe(5 - sold);
      expect((await market.getPortfolio({})).holdings).toHaveLength(0);
    } finally {
      await h.close();
    }
  });
}
