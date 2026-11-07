import { expect, test } from "bun:test";
import { chainConfig } from "./config";

test("mainnet limits and threshold follow mainnet network with explicit overrides", () => {
  expect(chainConfig({}).chainLimits).toBe("off");
  expect(
    chainConfig({ ADAPTERS: "mock", ARC_NETWORK: "mainnet" })
      .agentApprovalThreshold,
  ).toBe(10_000_000n);
  expect(
    chainConfig({ ADAPTERS: "arc", ARC_NETWORK: "mainnet" })
      .agentApprovalThreshold,
  ).toBe(10_000_000n);
  expect(
    chainConfig({ ADAPTERS: "arc", ARC_NETWORK: "testnet" }).chainLimits,
  ).toBe("off");
  expect(
    chainConfig({
      CHAIN_LIMITS: "mainnet",
      AGENT_APPROVAL_THRESHOLD_USDC: "12.345678",
    }).agentApprovalThreshold,
  ).toBe(12_345_678n);
  expect(() => chainConfig({ CHAIN_LIMITS: "true" })).toThrow("CHAIN_LIMITS");
  expect(() => chainConfig({ CHAIN_PAUSED: "yes" })).toThrow("CHAIN_PAUSED");
  for (const value of ["-1", "NaN", "1.0000001", "1e3"])
    expect(() => chainConfig({ AGENT_APPROVAL_THRESHOLD_USDC: value })).toThrow(
      "AGENT_APPROVAL_THRESHOLD_USDC",
    );
});
