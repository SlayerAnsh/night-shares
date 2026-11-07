import { expect, mock, test } from "bun:test";
import { keccak256, zeroAddress, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildContainer } from "../../container/build-container";
import { createJobRegistry } from "../../jobs/registry";
import { loadDeployment } from "../arc-deployment/arc-deployment";
import type { ForkClient } from "../arc-deployment/validate";
import type { ChainReader } from "../chain-reader/chain-reader";
import { createGasFloat } from "../wallet-custody/gas-float";
import { forkProvisioner } from "../wallet-custody/provision-fork";
import type { TransactionEnvelope } from "../wallet-custody/wallet-custody";
import { type ChainCommand, serialize } from "./chain-executor";
import { createChainExecutor } from "./chain-executor.viem";

const disabled = "Chain execution is disabled (CHAIN_EXECUTION=off).";
function fixture(network: "mainnet" | "testnet" | "fork", enabled?: boolean) {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
  });
  const source = loadDeployment("testnet");
  if (!source) throw new Error("Missing fixture source.");
  const deployment = {
    ...source,
    chainId: network === "testnet" ? 5042002 : 5042,
  };
  const account = privateKeyToAccount(`0x${"12".repeat(32)}`);
  const wallet = { walletId: "chain:ops", address: account.address };
  const sign = mock(async (_id: string, tx: TransactionEnvelope) =>
    account.signTransaction(tx),
  );
  const receipt = {
    status: "success",
    blockNumber: 1n,
    blockHash: zeroHash,
    logs: [],
  };
  const send = mock(
    async ({
      serializedTransaction,
    }: {
      serializedTransaction: `0x${string}`;
    }) => keccak256(serializedTransaction),
  );
  const client = {
    getTransactionReceipt: async () => {
      throw Object.assign(new Error(), {
        name: "TransactionReceiptNotFoundError",
      });
    },
    getTransactionCount: async () => 0,
    estimateGas: async () => 21000n,
    estimateFeesPerGas: async () => ({
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
    }),
    getBalance: async () => 10n ** 20n,
    sendRawTransaction: send,
    waitForTransactionReceipt: async () => receipt,
    getBlock: async () => ({ hash: zeroHash }),
  } as unknown as ForkClient;
  const poll = mock(async () => ({
    number: 1n,
    hash: zeroHash,
    timestamp: 1n,
  }));
  const reader = {
    fingerprint: "fixture",
    assertCurrent: async () => {},
    poll,
    ingest: async () => {},
  } as unknown as ChainReader;
  const executor = createChainExecutor({
    db: ports.db,
    deployment,
    client,
    reader,
    network,
    executionEnabled: enabled,
    custody: {
      createWallet: async () => wallet,
      getWallet: async () => wallet,
      resolveWallet: async () => wallet,
      signTypedData: async () => zeroHash,
      signTransaction: sign,
    },
  });
  ports.chainExecutor = executor;
  ports.chainReader = reader;
  return { ports, executor, sign, send, poll, client, reader, wallet };
}

for (const network of ["fork", "testnet", "mainnet"] as const) {
  test(`${network}: execution off blocks commands, persisted recovery, provisioning and ticking jobs before signing or sends`, async () => {
    const f = fixture(network, false);
    try {
      const commands: ChainCommand[] = [
        { kind: "nativeTransfer", to: zeroAddress, amount: 1n },
        { kind: "provisionToken", to: zeroAddress, amount: 1n },
        { kind: "sweep", night: zeroHash },
        { kind: "settleCutoff", night: zeroHash },
        { kind: "pushBatch", night: zeroHash, count: 1n },
        {
          kind: "withdrawCredit",
          contract: "Settlement",
          recipient: zeroAddress,
        },
        { kind: "verifyHuman", humanId: 1n, orb: true },
      ];
      for (const command of commands) {
        await expect(
          f.executor.execute({
            operationId: command.kind,
            walletId: "chain:ops",
            command,
          }),
        ).rejects.toMatchObject({
          code: "FAILED_PRECONDITION",
          message: disabled,
        });
      }
      f.ports.db
        .query(
          "INSERT INTO chain_operations (id,fingerprint,payload_hash,command,wallet_id,sender,state,nonce,calldata,destination,signed_payload,tx_hash) VALUES (?,?,?,?,?,?,'signed',0,'0x',?,'0x02',?)",
        )
        .run(
          "recover",
          "fixture",
          "hash",
          serialize(commands[0]),
          "chain:ops",
          zeroAddress,
          zeroAddress,
          zeroHash,
        );
      await expect(f.executor.recover("recover")).rejects.toThrow(disabled);
      const gas = createGasFloat({
        db: f.ports.db,
        fingerprint: "fixture",
        opsAddress: zeroAddress,
        policy: {
          float: 50n,
          lowWater: 10n,
          dailyCap: 200n,
          opsMinBalance: 100n,
        },
        getBalance: async () => 0n,
        executor: f.executor,
      });
      await expect(gas.provision(f.wallet)).rejects.toThrow(disabled);
      const provision = forkProvisioner({
        db: f.ports.db,
        rpcUrl: "http://127.0.0.1:1",
        client: f.client,
        reader: f.reader,
        fingerprint: "fixture",
        executor: f.executor,
      });
      await expect(provision(f.wallet)).rejects.toThrow(disabled);
      for (let tick = 0; tick < 2; tick++)
        for (const job of createJobRegistry(f.ports))
          await expect(job.run()).rejects.toThrow(disabled);
      expect(f.poll).toHaveBeenCalledTimes(2);
      expect(f.sign).not.toHaveBeenCalled();
      expect(f.send).not.toHaveBeenCalled();
      expect(f.ports.db.query("SELECT * FROM chain_gas_float").all()).toEqual(
        [],
      );
    } finally {
      f.ports.db.close();
    }
  });
}

test("mainnet explicit on executes and recovers identical signed bytes", async () => {
  const f = fixture("mainnet", true);
  try {
    const result = await f.executor.execute({
      operationId: "mainnet",
      walletId: "chain:ops",
      command: { kind: "nativeTransfer", to: zeroAddress, amount: 1n },
    });
    expect(result.state).toBe("finalized");
    expect((await f.executor.recover("mainnet")).state).toBe("finalized");
    expect(f.sign).toHaveBeenCalledTimes(1);
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.send.mock.calls[0]).toEqual(f.send.mock.calls[1]);
  } finally {
    f.ports.db.close();
  }
});
