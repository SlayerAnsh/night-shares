import { expect, test } from "bun:test";
import { openDatabase } from "../../db/open-database";
import type { ExecutionRequest } from "../chain-executor/chain-executor";
import { createGasFloat } from "./gas-float";

const ops = `0x${"11".repeat(20)}` as const;
const user = { walletId: "user", address: `0x${"22".repeat(20)}` as const };
const policy = {
  float: 50n,
  lowWater: 10n,
  dailyCap: 100n,
  opsMinBalance: 100n,
};
test("gas float first use, low water, daily cap, day rollover and ops readiness", async () => {
  const db = openDatabase(":memory:");
  let balance = 0n,
    opsBalance = 1000n,
    day = 0;
  const calls: ExecutionRequest[] = [];
  const gas = createGasFloat({
    db,
    fingerprint: "test",
    opsAddress: ops,
    policy,
    now: () => day * 86400000,
    getBalance: async (address) => (address === ops ? opsBalance : balance),
    executor: {
      mode: "chain",
      pending: () => [],
      recover: async () => {
        throw new Error("unused");
      },
      execute: async (request) => {
        calls.push(request);
        if (request.command.kind !== "nativeTransfer")
          throw new Error("Expected native transfer");
        balance += request.command.amount;
        return {
          operationId: request.operationId,
          fingerprint: "test",
          state: "finalized",
        };
      },
    },
  });
  try {
    await gas.provision(user);
    expect(balance).toBe(50n);
    await gas.provision(user);
    expect(calls.length).toBe(1);
    balance = 9n;
    await gas.provision(user);
    expect(balance).toBe(50n);
    balance = 0n;
    await expect(gas.provision(user)).rejects.toThrow(
      "CHAIN_GAS_DAILY_CAP_PER_WALLET",
    );
    expect(calls.length).toBe(2);
    day++;
    await gas.provision(user);
    expect(calls.length).toBe(3);
    opsBalance = 99n;
    expect(await gas.readiness()).toContain("CHAIN_OPS_MIN_BALANCE");
    await expect(gas.provision(user)).rejects.toThrow("CHAIN_OPS_MIN_BALANCE");
    opsBalance = 100n;
    expect(await gas.readiness()).toBeUndefined();
  } finally {
    db.close();
  }
});
test("uncertain gas reservations survive recreation and midnight with same journal operation", async () => {
  const db = openDatabase(":memory:");
  const calls: ExecutionRequest[] = [];
  let now = 0;
  const deps = {
    db,
    fingerprint: "test",
    opsAddress: ops,
    policy,
    now: () => now,
    getBalance: async (address: string) => (address === ops ? 1000n : 0n),
    executor: {
      mode: "chain" as const,
      pending: () => [],
      recover: async () => {
        throw new Error("unused");
      },
      execute: async (request: ExecutionRequest) => {
        calls.push(request);
        return {
          operationId: request.operationId,
          fingerprint: "test",
          state: "needs_reconciliation" as const,
        };
      },
    },
  };
  try {
    await expect(createGasFloat(deps).provision(user)).rejects.toThrow(
      "reconciliation",
    );
    now += 86400000;
    await expect(createGasFloat(deps).provision(user)).rejects.toThrow(
      "reconciliation",
    );
    expect(calls[1]).toEqual(calls[0]);
    expect(db.query("SELECT day FROM chain_gas_float").get()).toEqual({
      day: "1970-01-02",
    });
    expect(db.query("SELECT * FROM chain_gas_float").all()).toHaveLength(1);
  } finally {
    db.close();
  }
});
