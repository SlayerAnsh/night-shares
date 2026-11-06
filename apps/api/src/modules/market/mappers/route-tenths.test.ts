import { expect, test } from "bun:test";
import type { BuyResult } from "@night-shares/market-model";
import { reserveRecall } from "../../stay/use-cases/booking/reserve-recall";
import { fixture } from "../testing/fixture";
import { quoteBuy } from "../use-cases/trading/quote-buy";
import { settleBuy } from "../use-cases/trading/settle-buy";
import { buyQuote } from "./route";

const invalid: BuyResult = {
  filled: 0.3,
  avg: 1,
  gross: 0.3,
  total: 0.3,
  fee: 0,
  sellerFees: 0,
  sellerNet: 0.3,
  fills: [
    { src: "recall", take: 0.15, price: 1 },
    { src: "recall", take: 0.15, price: 1 },
  ],
};

test("whole total cannot hide fractional quote, settlement or recall legs", async () => {
  const d = await fixture();
  try {
    const before = d.ports.inventory.get(d.key);
    expect(() => buyQuote(before, 3, invalid, 0)).toThrow("whole tenths");
    let settled = false;
    d.ports.walletProvider.settle = async () => {
      settled = true;
      return [];
    };
    await expect(
      settleBuy(d, d.user, d.key, invalid, "mm-bot", before.state),
    ).rejects.toThrow("whole tenths");
    expect(settled).toBe(false);
    expect(() => reserveRecall(d.ports, before, invalid, before)).toThrow(
      "whole tenths",
    );
    expect(d.ports.inventory.get(d.key)).toEqual(before);
    expect(d.repo.holders(d.key)).toEqual([]);
  } finally {
    d.ports.db.close();
  }
});

test("fractional allotment caps floor to executable tenths", async () => {
  const d = await fixture();
  try {
    d.ports.inventory.update(d.key, (r) => ({
      ...r,
      state: { ...r.state, S: 4.1, q: 0, held: 0, booked: 0, traderAsks: [] },
    }));
    expect(quoteBuy(d, d.key, 1).cap?.tenths).toBe(12);
  } finally {
    d.ports.db.close();
  }
});
