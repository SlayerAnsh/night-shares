import { describe, expect, test } from "bun:test";
import { priceLimit, slippageLabel } from "./slippage";

describe("price limit", () => {
  test("a buy may pay up to 0.5% more, rounded up", () => {
    expect(priceLimit(10_000_000n, "buy")).toBe(10_050_000n);
    expect(priceLimit(1n, "buy")).toBe(2n);
  });

  test("a sell receives at least 0.5% less, rounded down", () => {
    expect(priceLimit(10_000_000n, "sell")).toBe(9_950_000n);
    expect(priceLimit(1n, "sell")).toBe(0n);
  });

  test("zero slippage sends the quote itself", () => {
    expect(priceLimit(123n, "buy", 0)).toBe(123n);
    expect(priceLimit(123n, "sell", 0)).toBe(123n);
  });

  test("out of range slippage is rejected", () => {
    expect(() => priceLimit(1n, "buy", -1)).toThrow();
    expect(() => priceLimit(1n, "buy", 10001)).toThrow();
  });

  test("the label reads as a percent", () => {
    expect(slippageLabel()).toBe("0.5%");
    expect(slippageLabel(125)).toBe("1.25%");
  });
});

test("quote tolerance preserves zero and defaults only when absent", async () => {
  const { quoteSlippageBps } = await import("./slippage");
  expect(quoteSlippageBps()).toBe(50);
  expect(quoteSlippageBps({})).toBe(50);
  expect(quoteSlippageBps({ slippageBps: 0 })).toBe(0);
  expect(
    priceLimit(10000n, "buy", quoteSlippageBps({ slippageBps: 125 })),
  ).toBe(10125n);
});
