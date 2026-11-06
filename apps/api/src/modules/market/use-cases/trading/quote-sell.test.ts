import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { quoteSell } from "./quote-sell";

test("sell preview applies current late fee without changing inventory", async () => {
  const d = await fixture(),
    before = d.ports.inventory.get(d.key);
  const quote = quoteSell(d, d.key, 2);
  expect(quote.filled?.tenths).toBe(2);
  expect(quote.lateFee?.micros).toBeGreaterThan(0n);
  expect(quote.total?.micros).toBeLessThan(quote.gross?.micros ?? 0n);
  expect(d.ports.inventory.get(d.key)).toEqual(before);
});
