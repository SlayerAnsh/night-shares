import { expect, test } from "bun:test";
import { parseEther } from "viem";
import { loadConfig } from "./load-config";

test("gas policy defaults use native 18-decimal USDC and chain headroom overrides legacy alias", () => {
  expect(loadConfig({}).gasPolicy).toEqual({
    float: parseEther("0.05"),
    lowWater: parseEther("0.01"),
    dailyCap: parseEther("0.2"),
    opsMinBalance: parseEther("0.1"),
  });
  expect(
    loadConfig({
      CHAIN_GAS_HEADROOM_BPS: "15000",
      FORK_GAS_HEADROOM_BPS: "12000",
    }).forkGasHeadroomBps,
  ).toBe(15000);
});
test("gas policy rejects invalid amounts and inconsistent limits", () => {
  for (const name of [
    "CHAIN_GAS_FLOAT",
    "CHAIN_GAS_LOW_WATER",
    "CHAIN_GAS_DAILY_CAP_PER_WALLET",
    "CHAIN_OPS_MIN_BALANCE",
  ])
    for (const value of ["0", "-1", "NaN", "1e-2", "0.0000000000000000001"])
      expect(() => loadConfig({ [name]: value })).toThrow(name);
  expect(() => loadConfig({ CHAIN_GAS_LOW_WATER: "0.05" })).toThrow(
    "low water < float <= daily cap",
  );
  expect(() => loadConfig({ CHAIN_GAS_DAILY_CAP_PER_WALLET: "0.01" })).toThrow(
    "low water < float <= daily cap",
  );
});
