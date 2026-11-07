import { expect, test } from "bun:test";
import { keccak256, stringToHex } from "viem";
import {
  buyRequirements,
  type RequirementsDeps,
  sellRequirements,
} from "./requirements";

const key = "prop_1:rt_1:2026-12-01";
const token = `0x${"33".repeat(20)}` as const;
const deps: RequirementsDeps = {
  deployment: {
    chainId: 5042,
    USDC: `0x${"11".repeat(20)}`,
    X402Settler: `0x${"22".repeat(20)}`,
    USDC_EIP712: { name: "USDC", version: "2" },
  },
  clock: { now: () => 1800000000000 },
  salt: () => `0x${"44".repeat(32)}`,
  quoteBuy: async () => ({ total: 101300n, fills: 3, asks: [] }),
  reader: { tokenOf: async () => token },
};
test("buy requirement adds one micro per tenth and caps at maxTotal", async () => {
  const result = await buyRequirements(deps, {
    nightKey: key,
    tenths: 3,
    maxTotal: 101303n,
  });
  expect(result.maxAmountRequired).toBe("101303");
  expect(result.asset).toBe(deps.deployment.USDC);
  expect(result.payTo).toBe(deps.deployment.X402Settler);
  expect(result.network).toBe("eip155:5042");
  expect(result.maxTimeoutSeconds).toBe(120);
  expect(result.extra).toEqual({
    name: "USDC",
    version: "2",
    terms: {
      side: "buy",
      night: keccak256(stringToHex(key)),
      qty: "300000000000000000",
      deadline: "1800000120",
      salt: deps.salt(),
    },
  });
  try {
    await buyRequirements(deps, {
      nightKey: key,
      tenths: 3,
      maxTotal: 101302n,
    });
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toMatchObject({
      status: 409,
      reason: "Price above your maximum",
    });
  }
});
test("sell requirement names the night token as asset", async () => {
  const result = await sellRequirements(deps, {
    nightKey: key,
    tenths: 3,
    minProceeds: 100n,
  });
  expect(result.asset).toBe(token);
  expect(result.maxAmountRequired).toBe("300000000000000000");
  expect(result.extra.name).toBe("NightShares Room Night");
  expect(result.extra.version).toBe("1");
  expect(result.extra.terms.minReceived).toBe("100");
  expect(result.extra.terms.side).toBe("sell");
});
test("requirements reject fractional quantities, negative limits and partial fills", async () => {
  await expect(
    buyRequirements(deps, { nightKey: key, tenths: 0.5, maxTotal: 100n }),
  ).rejects.toThrow();
  await expect(
    sellRequirements(deps, { nightKey: key, tenths: 1, minProceeds: -1n }),
  ).rejects.toThrow();
  await expect(
    buyRequirements(deps, { nightKey: key, tenths: 4, maxTotal: 999999n }),
  ).rejects.toThrow("Sold out");
});
