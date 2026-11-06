import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { quoteBuy } from "./quote-buy";

test("buy preview is read only and excludes guest-only liquidity", async () => {
  const d = await fixture(),
    before = d.ports.inventory.get(d.key);
  const quote = quoteBuy(d, d.key, 2, d.user);
  expect(quote.filled?.tenths).toBe(2);
  expect(quote.gross?.micros).toBe(146999997n);
  expect(quote.fee?.micros).toBe(1911000n);
  expect(quote.total?.micros).toBe(148910997n);
  expect(quote.total?.micros).toBeGreaterThan(quote.gross?.micros ?? 0n);
  expect(d.ports.inventory.get(d.key)).toEqual(before);
  d.ports.inventory.update(d.key, (r) => ({
    ...r,
    state: { ...r.state, q: r.state.S, traderAsks: [] },
  }));
  expect(quoteBuy(d, d.key, 2).filled?.tenths).toBe(0);
});
