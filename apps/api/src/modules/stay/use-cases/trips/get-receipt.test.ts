import { expect, test } from "bun:test";
import { tripFixture } from "../../test-support/fixture";

test("receipt reports exact subtotal and excludes guest contact details", () => {
  const f = tripFixture();
  const receipt = f.cases.getReceipt(f.trip.id, "guest");
  expect(receipt.subtotal.micros).toBe(98n);
  expect(receipt.walletAddress).toBe("wallet");
  expect(receipt.trip).not.toHaveProperty("guestName");
  expect(receipt.trip).not.toHaveProperty("guestEmail");
});
