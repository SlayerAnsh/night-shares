import { expect, test } from "bun:test";
import { fixture } from "../../test-support/fixture";

test("quote sums exclusive nights in integer micros and stores an isolated snapshot", () => {
  const f = fixture();
  const quote = f.cases.quoteStay(f.selection);
  expect(quote.nights).toHaveLength(2);
  expect(quote.total?.micros).toBe(
    quote.nights.reduce((s, n) => s + (n.price?.micros ?? 0n), 0n),
  );
  if (quote.selection) quote.selection.rooms = 4;
  expect(f.repo.quotes.get(quote.id)?.selection?.rooms).toBe(1);
});
test("quote rejects missing selection, invalid dates and unavailable inventory", () => {
  const f = fixture();
  expect(() => f.cases.quoteStay(undefined)).toThrow();
  expect(() =>
    f.cases.quoteStay({ ...f.selection, checkOut: f.selection.checkIn }),
  ).toThrow();
  f.ports.inventory.update(f.key, (r) => ({ ...r, stopped: true }));
  expect(() => f.cases.quoteStay(f.selection)).toThrow(
    "Not enough rooms available.",
  );
});
