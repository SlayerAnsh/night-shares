import { createHmac, timingSafeEqual } from "node:crypto";
import type { OrderSigner } from "./order-signer";
export function createMockOrderSigner(
  secret = "night-shares-dev-order-secret",
): OrderSigner {
  const signCustodial = (maker: string, digest: string) =>
    `mock:${createHmac("sha256", secret).update(`${maker}|${digest}`).digest("hex")}`;
  return {
    signCustodial,
    verify(maker, digest, signature) {
      const expected = Buffer.from(signCustodial(maker, digest));
      const actual = Buffer.from(signature);
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    },
  };
}
