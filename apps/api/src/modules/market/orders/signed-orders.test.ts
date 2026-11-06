import { expect, test } from "bun:test";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { expireAsks } from "../../../jobs/expire-asks";
import { fixture } from "../testing/fixture";
import { postAsk } from "../use-cases/account/post-ask";
import { getBook } from "../use-cases/queries/get-book";
import { buy } from "../use-cases/trading/buy";
import { sell } from "../use-cases/trading/sell";
import { cancelAllAsks } from "./cancel-all";
import { prepareAsk } from "./prepare";
import { orderSettings } from "./settings";
import { signedAsks } from "./store";
import { defaultDomain, orderTypedData } from "./typed-data";

async function funded() {
  const d = await fixture();
  await buy(d, d.user, d.key, 5, 10n ** 12n);
  const buyer = {
    ...d.user,
    id: "usr_other",
    humanId: "other",
    walletAddress: await d.ports.walletProvider.linkWallet("other"),
  };
  return { ...d, buyer };
}
test("typed data binds domain and fields; explicit signatures reject tampering and stale nonce", async () => {
  const d = await funded();
  try {
    const prepared = prepareAsk(d, d.user, d.key, 5, 1000000n);
    expect(prepared.expires).toBe(d.ports.clock.now() + 86400000);
    expect(JSON.parse(prepared.typedDataJson).message.price).toBe("1000000");
    const order = {
      night: d.key,
      maker: d.user.walletAddress,
      size: 5,
      price: 1000000n,
      expiry: prepared.expires,
      nonce: 0n,
    };
    expect(orderTypedData(order, defaultDomain).digest).toBe(prepared.digest);
    expect(
      orderTypedData(order, { ...defaultDomain, chainId: 1 }).digest,
    ).not.toBe(prepared.digest);
    const signature = orderSettings(d.ports).signer.signCustodial(
      d.user.walletAddress,
      prepared.digest,
    );
    const options = {
      expiry: prepared.order.expiry,
      nonce: prepared.order.nonce,
      signature,
    };
    expect(postAsk(d, d.user, d.key, 5, 1000000n, options).ask.digest).toBe(
      prepared.digest,
    );
    expect(() => postAsk(d, d.user, d.key, 4, 1000000n, options)).toThrow(
      "Invalid ask signature",
    );
    expect(cancelAllAsks(d, d.user)).toEqual({ nonce: 1n, cancelledCount: 1 });
    expect(() => postAsk(d, d.user, d.key, 5, 1000000n, options)).toThrow(
      "nonce is stale",
    );
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(5);
    expect(
      getBook(d, d.key).asks.some((a) => a.askId === prepared.order.id),
    ).toBe(false);
  } finally {
    d.ports.db.close();
  }
});
test("expired orders disappear from reads and fills before cleanup runs", async () => {
  const d = await funded();
  try {
    const now = d.ports.clock.now();
    const ask = postAsk(d, d.user, d.key, 5, 1000000n, {
      expiry: timestampFromMs(now + 1000),
    }).ask;
    d.ports.clock = { now: () => now + 1000, today: () => "2026-12-01" };
    expect(getBook(d, d.key).asks.some((a) => a.askId === ask.id)).toBe(false);
    const trade = await buy(d, d.buyer, d.key, 1, 10n ** 12n);
    expect(trade.quote?.fills.some((f) => f.askId === ask.id)).toBe(false);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(5);
    expect(expireAsks(d.ports)).toBe(1);
    expect(signedAsks(d.ports.db, d.key)[0]?.status).toBe("expired");
    expect(() =>
      prepareAsk(d, d.user, d.key, 1, 1n, timestampFromMs(now)),
    ).toThrow("expiry");
    expect(() =>
      prepareAsk(d, d.user, d.key, 1, 1n, timestampFromMs(now + 8 * 86400000)),
    ).toThrow("expiry");
  } finally {
    d.ports.db.close();
  }
});
test("listed tokens remain sellable and fills stop at current holding", async () => {
  const d = await funded();
  try {
    const ask = postAsk(d, d.user, d.key, 5, 1000000n).ask;
    await sell(d, d.user, d.key, 3, 0n);
    expect(
      getBook(d, d.key).asks.find((a) => a.askId === ask.id)?.size.tenths,
    ).toBe(2);
    const trade = await buy(d, d.buyer, d.key, 5, 10n ** 12n);
    expect(
      trade.quote?.fills
        .filter((f) => f.askId === ask.id)
        .reduce((n, f) => n + (f.size?.tenths ?? 0), 0),
    ).toBe(2);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
    expect(getBook(d, d.key).asks.some((a) => a.askId === ask.id)).toBe(false);
  } finally {
    d.ports.db.close();
  }
});
test("failed signed fill restores maker holding, listing and realised statistics", async () => {
  const d = await funded();
  try {
    postAsk(d, d.user, d.key, 5, 1000000n);
    const position = { ...d.repo.position(d.user.humanId, d.key) };
    const before = d.ports.inventory.get(d.key);
    d.ports.walletProvider.settle = async () => {
      throw new Error("settlement failed");
    };
    await expect(buy(d, d.buyer, d.key, 5, 10n ** 12n)).rejects.toThrow(
      "settlement failed",
    );
    expect(d.repo.position(d.user.humanId, d.key)).toEqual(position);
    expect(d.ports.inventory.get(d.key)).toEqual(before);
  } finally {
    d.ports.db.close();
  }
});
