import { expect, test } from "bun:test";
import { x402BuyNonce, x402SellNonce } from "./nonce";

const night = `0x${"11".repeat(32)}` as const;
const salt = `0x${"22".repeat(32)}` as const;
// Independently derived with cast abi-encode and cast keccak from Task 5's formulas.
// Task 5's forge vectors are not yet available in this checkout.
test("nonce matches the independently derived contract formula vector", () => {
  expect(x402BuyNonce(night, 10n ** 18n, 1800000000n, salt)).toBe(
    "0xc260615787001dfb6cdbf340d7fca89318cb31a375b2efafed19238ac271ccf3",
  );
  expect(x402SellNonce(night, 1000000n, 1800000000n, salt)).toBe(
    "0xd035db4837f35c7edf6be1108a6208d8162c245aaab2dbd05ab8892d25658bfc",
  );
});
test("nonce binds every term and separates buy from sell", () => {
  const base = x402BuyNonce(night, 1n, 2n, salt);
  for (const changed of [
    x402BuyNonce(salt, 1n, 2n, salt),
    x402BuyNonce(night, 2n, 2n, salt),
    x402BuyNonce(night, 1n, 3n, salt),
    x402BuyNonce(night, 1n, 2n, night),
    x402SellNonce(night, 1n, 2n, salt),
  ])
    expect(changed).not.toBe(base);
});
