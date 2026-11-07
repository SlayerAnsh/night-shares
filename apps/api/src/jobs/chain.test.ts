import { expect, test } from "bun:test";
import { zeroAddress, zeroHash } from "viem";
import { buildContainer } from "../container/build-container";
import {
  type ChainCommand,
  serialize,
} from "../ports/chain-executor/chain-executor";
import type { ChainReader } from "../ports/chain-reader/chain-reader";
import { createMockWalletCustody } from "../ports/wallet-custody/wallet-custody.mock";
import { runChainJobs } from "./chain";
import { createJobRegistry } from "./registry";

function fixture() {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
  });
  const record = ports.inventory.seedNight({
    propertyId: "prop_velana",
    roomTypeId: "rt_velana_0",
    date: "2030-01-01",
  });
  ports.inventory.list = () => [record];
  ports.db.exec("CREATE TABLE anvil_wallets (address TEXT)");
  ports.db
    .query("INSERT INTO chain_instances VALUES (?, ?, 1)")
    .run("test", serialize({}));
  ports.walletProvider.custody = createMockWalletCustody();
  const commands: ChainCommand[] = [];
  const block = { number: 1n, timestamp: 200n, hash: zeroHash };
  let settled = false;
  const reader: ChainReader = {
    fingerprint: "test",
    assertCurrent: async () => {},
    head: async () => block,
    poll: async () => block,
    ingest: async () => {},
    watch: () => {},
    tokenOf: async () => zeroAddress,
    simulate: async () => ({ block, value: 0n }),
    cash: async () => ({ block, value: { native: 0n, usdc: 0n } }),
    read: async <T>(request: Parameters<ChainReader["read"]>[0]) => ({
      block,
      value: ({
        tokenOf: "0x1111111111111111111111111111111111111111",
        config: { cutoff: 100n },
        cutoffSettled: settled,
        cursor: "0x2222222222222222222222222222222222222222",
      }[request.functionName] ?? 0n) as T,
    }),
  };
  ports.chainReader = reader;
  ports.chainAttester = { address: zeroAddress, sign: async () => zeroHash };
  ports.chainExecutor = {
    mode: "fork",
    pending: () => [],
    recover: async () => {
      throw new Error("Unexpected recovery");
    },
    execute: async (request) => {
      commands.push(request.command);
      if (request.command.kind === "settleCutoff") settled = true;
      // A mined-but-unprojected execution must not release local inventory.
      return {
        operationId: request.operationId,
        fingerprint: "test",
        state: "submitted",
      };
    },
  };
  return { ports, reader, commands, record };
}

test("fork registry replaces every optimistic mock worker", () => {
  const f = fixture();
  try {
    expect(createJobRegistry(f.ports).map((job) => job.name)).toEqual([
      "chain-recovery-and-keepers",
    ]);
  } finally {
    f.ports.db.close();
  }
});

test("deployment mismatch fails closed before recovery or payouts", async () => {
  const f = fixture();
  f.reader.assertCurrent = async () => {
    throw new Error("Deployment fingerprint changed");
  };
  try {
    await expect(runChainJobs(f.ports)).rejects.toThrow(
      "Deployment fingerprint changed",
    );
    expect(f.commands).toHaveLength(0);
  } finally {
    f.ports.db.close();
  }
});

test("pending cutoff receipt does not finalize local inventory or push holders", async () => {
  const f = fixture();
  const before = f.ports.inventory.get(f.record.key).released;
  try {
    await expect(runChainJobs(f.ports)).rejects.toThrow(
      "Chain jobs require reconciliation",
    );
    expect(f.commands.map((c) => c.kind)).toEqual(["settleCutoff"]);
    expect(f.ports.inventory.get(f.record.key).released).toBe(before);
  } finally {
    f.ports.db.close();
  }
});

test("external cutoff settlement pushes at most 100 and never uses the mock ledger", async () => {
  const f = fixture();
  const read = f.reader.read;
  f.reader.read = async <T>(request: Parameters<ChainReader["read"]>[0]) =>
    request.functionName === "cutoffSettled"
      ? { block: await f.reader.head(), value: true as T }
      : read<T>(request);
  f.ports.walletProvider.settle = async () => {
    throw new Error("Mock ledger forbidden");
  };
  try {
    await expect(runChainJobs(f.ports)).rejects.toThrow(
      "Chain jobs require reconciliation",
    );
    expect(f.commands).toHaveLength(1);
    expect(f.commands[0]).toMatchObject({ kind: "pushBatch", count: 100n });
  } finally {
    f.ports.db.close();
  }
});
