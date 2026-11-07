import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEther } from "viem";
import { openDatabase } from "../../db/open-database";
import { isolatedHostFork } from "../../modules/host/chain/fork-fixture";
import { loadDeployment } from "../arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../arc-deployment/local-fork";
import { forkClient, validateDeployment } from "../arc-deployment/validate";
import { createChainReader } from "../chain-reader/chain-reader.viem";
import { createGasFloat } from "../wallet-custody/gas-float";
import { anvilAccount } from "../wallet-custody/wallet-custody.anvil";
import { createPrivyWalletCustody } from "../wallet-custody/wallet-custody.privy";
import { createChainExecutor } from "./chain-executor.viem";

(process.env.FORK_IT === "1" ? test : test.skip)(
  "Privy HTTP stub: journaled ops float, lost signing response, crash recovery and identical bytes",
  async () => {
    const upstream = process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545";
    assertLocalForkRpc(upstream);
    const d = loadDeployment("fork", process.env.ARC_DEPLOYMENT_FILE);
    if (!d) throw new Error("Deployment required.");
    const child = await isolatedHostFork(
      upstream,
      Number(await forkClient(upstream).getBlockNumber()),
    );
    const dir = mkdtempSync(join(tmpdir(), "privy-journal-"));
    const path = join(dir, "journal.db");
    let db = openDatabase(path);
    const user = anvilAccount(81234),
      ops = anvilAccount(0);
    const keys: string[] = [];
    let signatures = 0;
    const stub = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        if (request.method === "GET")
          return Response.json({
            id: "privy-local",
            address: user.address,
            chain_type: "ethereum",
          });
        const body = await request.json();
        expect(body.method).toBe("eth_signTransaction");
        const tx = body.params.transaction;
        keys.push(request.headers.get("privy-idempotency-key") ?? "");
        const signed = await user.signTransaction({
          chainId: tx.chain_id,
          type: "eip1559",
          nonce: tx.nonce,
          to: tx.to,
          data: tx.data,
          value: BigInt(tx.value),
          gas: BigInt(tx.gas_limit),
          maxFeePerGas: BigInt(tx.max_fee_per_gas),
          maxPriorityFeePerGas: BigInt(tx.max_priority_fee_per_gas),
        });
        signatures++;
        if (signatures === 1) return new Response(null, { status: 503 });
        return Response.json({
          method: body.method,
          data: { encoding: "rlp", signed_transaction: signed },
        });
      },
    });
    try {
      const client = forkClient(child.rpcUrl);
      const fingerprint = await validateDeployment(d, client);
      const adapter = createPrivyWalletCustody({
        appId: "stub",
        appSecret: "stub",
        fetch: (url, init) =>
          fetch(`${stub.url}${new URL(url).pathname}`, init),
      });
      const custody = {
        ...adapter,
        resolveWallet: async (id: string) =>
          id === "chain:ops"
            ? { walletId: id, address: ops.address }
            : adapter.resolveWallet(id),
        signTransaction: (
          id: string,
          tx: Parameters<NonNullable<typeof adapter.signTransaction>>[1],
        ) =>
          id === "chain:ops"
            ? ops.signTransaction(tx)
            : adapter.signTransaction(id, tx),
      };
      const broadcastBytes: string[] = [];
      let rejectBroadcast = false;
      const journalClient = {
        ...client,
        sendRawTransaction: async (
          args: Parameters<typeof client.sendRawTransaction>[0],
        ) => {
          broadcastBytes.push(args.serializedTransaction);
          if (rejectBroadcast) {
            rejectBroadcast = false;
            throw new Error("Dropped before broadcast");
          }
          return client.sendRawTransaction(args);
        },
      };
      const build = (crash: boolean) => {
        const reader = createChainReader(db, d, client, fingerprint);
        let gas: ReturnType<typeof createGasFloat>;
        const executor = createChainExecutor({
          db,
          deployment: d,
          client: journalClient,
          reader,
          custody,
          network: "fork",
          provisionWallet: (wallet) => gas.provision(wallet),
          afterBroadcast: () => {
            if (crash) throw new Error("Crash after broadcast");
          },
        });
        gas = createGasFloat({
          db,
          fingerprint,
          opsAddress: ops.address,
          policy: {
            float: parseEther("0.05"),
            lowWater: parseEther("0.01"),
            dailyCap: parseEther("0.2"),
            opsMinBalance: parseEther("0.1"),
          },
          getBalance: (address) => client.getBalance({ address }),
          executor,
        });
        return executor;
      };
      let executor = build(false);
      const request = {
        operationId: "privy-approve",
        walletId: "privy-local",
        command: { kind: "approveUsdc" as const, amount: 123n },
      };
      await expect(executor.execute(request)).rejects.toThrow("rejected");
      expect(await client.getBalance({ address: user.address })).toBe(
        parseEther("0.05"),
      );
      expect(db.query("SELECT * FROM chain_gas_float").all()).toHaveLength(1);
      executor = build(true);
      const interrupted = await executor.execute(request);
      expect(interrupted.state).toBe("needs_reconciliation");
      expect(keys[0]).toBe(keys[1]);
      const bytes = db
        .query(
          "SELECT signed_payload FROM chain_operations WHERE id = 'privy-approve'",
        )
        .get();
      db.close();
      db = openDatabase(path);
      executor = build(false);
      const recovered = await executor.recover(request.operationId);
      expect(recovered.state).toBe("finalized");
      expect(recovered.hash).toBe(interrupted.hash);
      expect((await executor.execute(request)).hash).toBe(interrupted.hash);
      expect(signatures).toBe(2);
      expect(
        db
          .query(
            "SELECT signed_payload FROM chain_operations WHERE id = 'privy-approve'",
          )
          .get(),
      ).toEqual(bytes);
      expect(await client.getTransactionCount({ address: user.address })).toBe(
        1,
      );
      rejectBroadcast = true;
      const second = {
        ...request,
        operationId: "privy-rebroadcast",
        command: { kind: "approveUsdc" as const, amount: 456n },
      };
      const pending = await executor.execute(second);
      expect(pending.state).toBe("needs_reconciliation");
      const signedCount = signatures;
      db.close();
      db = openDatabase(path);
      executor = build(false);
      expect((await executor.recover(second.operationId)).state).toBe(
        "finalized",
      );
      expect(broadcastBytes.at(-1)).toBe(broadcastBytes.at(-2));
      expect(signatures).toBe(signedCount);
    } finally {
      stub.stop(true);
      db.close();
      child.stop();
      rmSync(dir, { recursive: true });
    }
  },
  120000,
);
