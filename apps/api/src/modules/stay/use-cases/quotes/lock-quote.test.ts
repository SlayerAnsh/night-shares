import { expect, test } from "bun:test";
import { fixture } from "../../test-support/fixture";

test("locks bind immutable quote snapshots to users for ten minutes", () => {
  const f = fixture();
  const quote = f.cases.quoteStay(f.selection);
  const lock = f.cases.lockQuote(quote.id, "alice");
  expect(lock.userId).toBe("alice");
  expect(lock.expiresAt - f.ports.clock.now()).toBe(600_000);
  expect(lock.quote).toEqual(quote);
  expect(() => f.cases.lockQuote("missing", "alice")).toThrow();
});
