import { expect, test } from "bun:test";
import { createMockOrderSigner } from "./order-signer.mock";

test("mock signatures bind maker, digest and configured secret", () => {
  const signer = createMockOrderSigner("test-secret");
  const signature = signer.signCustodial("maker", "digest");
  expect(signature).toMatch(/^mock:[0-9a-f]{64}$/);
  expect(signer.verify("maker", "digest", signature)).toBe(true);
  expect(signer.verify("other", "digest", signature)).toBe(false);
  expect(signer.verify("maker", "other", signature)).toBe(false);
  expect(signer.verify("maker", "digest", "")).toBe(false);
  expect(
    createMockOrderSigner("other").verify("maker", "digest", signature),
  ).toBe(false);
});
