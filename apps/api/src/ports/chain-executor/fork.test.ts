import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createForkFoundation } from "../../container/fork-foundation";
import { openDatabase } from "../../db/open-database";
import { loadDeployment } from "../arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../arc-deployment/local-fork";
import {
  forkClient,
  validateDeployment,
  validateExecutionAbi,
} from "../arc-deployment/validate";
import { createChainReader } from "../chain-reader/chain-reader.viem";
import { forkProvisioner } from "../wallet-custody/provision-fork";
import type { CustodyWallet } from "../wallet-custody/wallet-custody";
import { createAnvilWalletCustody } from "../wallet-custody/wallet-custody.anvil";
import { createChainExecutor } from "./chain-executor.viem";

const forkTest = process.env.FORK_IT === "1" ? test : test.skip;
forkTest(
  "fork: durable provisioning, bounded approval, crash after broadcast, restart, external reconciliation and reset quarantine",
  async () => {
    const upstream = process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545";
    assertLocalForkRpc(upstream);
    const d = loadDeployment("fork", process.env.ARC_DEPLOYMENT_FILE);
    if (!d) throw new Error("Deployment required.");
    const upstreamClient = forkClient(upstream);
    await validateDeployment(d, upstreamClient);
    const head = await upstreamClient.getBlockNumber();
    const reservation = createServer();
    await new Promise<void>((resolve) =>
      reservation.listen(0, "127.0.0.1", resolve),
    );
    const address = reservation.address();
    if (!address || typeof address === "string")
      throw new Error("No disposable fork port.");
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
    const rpcUrl = `http://127.0.0.1:${port}`;
    // All mutations run on this disposable child fork. Never write to the shared fork.
    const child = Bun.spawn(
      [
        "anvil",
        "--silent",
        "--port",
        String(port),
        "--chain-id",
        "5042",
        "--fork-url",
        upstream,
        "--fork-block-number",
        String(head),
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    const dir = mkdtempSync(join(tmpdir(), "execution-fork-"));
    const path = join(dir, "journal.db");
    let db = openDatabase(path);
    try {
      const client = forkClient(rpcUrl);
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          await client.getChainId();
          ready = true;
          break;
        } catch {
          await Bun.sleep(100);
        }
      }
      if (!ready || child.exitCode !== null)
        throw new Error("Disposable Anvil failed to start.");
      const fingerprint = await validateDeployment(d, client);
      const foundation = createForkFoundation(
        {
          port: 0,
          adapters: "mock",
          arcNetwork: "fork",
          walletCustody: "anvil",
          arcRpcUrl: rpcUrl,
          arcDeployment: d,
        },
        db,
      );
      expect(foundation.chainExecutor.mode).toBe("fork");
      await expect(foundation.walletProvider.settle([])).rejects.toThrow(
        "ChainExecutor",
      );
      let reader = createChainReader(db, d, client, fingerprint);
      let provision: (wallet: CustodyWallet) => Promise<void> = async () => {};
      let failFunding = true;
      const custody = createAnvilWalletCustody({
        db,
        network: "fork",
        deployment: d,
        rpcUrl,
        faucet: true,
        provision: async (w) => {
          if (failFunding) {
            failFunding = false;
            throw new Error("Injected native funding failure.");
          }
          await provision(w);
        },
      });
      let executor = createChainExecutor({
        db,
        deployment: d,
        client,
        reader,
        custody,
      });
      provision = forkProvisioner({
        reader,
        db,
        client,
        rpcUrl,
        fingerprint,
        executor,
      });
      const owner = { kind: "user" as const, humanId: "execution-foundation" };
      await expect(custody.createWallet(owner)).rejects.toThrow(
        "native funding failure",
      );
      const allocated = await custody.getWallet(owner);
      expect(allocated?.walletId).toBe("anvil:100");
      if (!allocated) throw new Error("Wallet allocation lost.");
      expect((await reader.cash(allocated.address)).value.native).toBe(0n);
      const wallet = await custody.createWallet(owner);
      const funded = (await reader.cash(wallet.address)).value;
      expect(funded.native).toBeGreaterThan(0n);
      expect(funded.usdc).toBe(100_000_000n);
      await custody.createWallet(owner);
      expect((await reader.cash(wallet.address)).value.usdc).toBe(funded.usdc);
      const approval = await executor.execute({
        operationId: "approval",
        walletId: wallet.walletId,
        command: { kind: "approveUsdc", amount: 1_000_000n },
      });
      expect(approval.state).toBe("finalized");
      const permit = await executor.execute({
        operationId: "permit",
        walletId: wallet.walletId,
        command: {
          kind: "approvePermit2",
          router: "TradeRouter",
          amount: 1_000_000n,
          expiration: Number((await reader.head()).timestamp) + 3600,
        },
      });
      expect(permit.state).toBe("finalized");
      const receiver = await custody.createWallet({
        kind: "user",
        humanId: "receiver",
      });
      const before = (await reader.cash(receiver.address)).value.usdc;
      executor = createChainExecutor({
        db,
        deployment: d,
        client,
        reader,
        custody,
        afterBroadcast: () => {
          throw new Error("Injected crash before receipt finalization.");
        },
      });
      const request = {
        operationId: "transfer-once",
        walletId: wallet.walletId,
        command: {
          kind: "transfer" as const,
          to: receiver.address,
          amount: 12345n,
        },
      };
      const interrupted = await executor.execute(request);
      expect(interrupted.state).toBe("needs_reconciliation");
      expect(interrupted.hash).toMatch(/^0x/);
      db.close();
      db = openDatabase(path);
      reader = createChainReader(db, d, client, fingerprint);
      const restartedCustody = createAnvilWalletCustody({
        db,
        network: "fork",
        deployment: d,
        rpcUrl,
      });
      executor = createChainExecutor({
        db,
        deployment: d,
        client,
        reader,
        custody: restartedCustody,
      });
      const recovered = await executor.recover(request.operationId);
      expect(recovered.state).toBe("finalized");
      expect((await executor.execute(request)).hash).toBe(interrupted.hash);
      expect((await reader.cash(receiver.address)).value.usdc).toBe(
        before + 12345n,
      );
      await expect(
        executor.execute({
          ...request,
          command: { ...request.command, amount: 12346n },
        }),
      ).rejects.toThrow("payload mismatch");
      reader.watch("receiver-cash", {
        contract: "USDC",
        functionName: "balanceOf",
        args: [receiver.address],
      });
      await reader.poll(100);
      const count = () =>
        db
          .query<{ n: number | bigint }, [string]>(
            "SELECT COUNT(*) AS n FROM chain_events WHERE tx_hash = ?",
          )
          .get(recovered.hash ?? "")?.n;
      const events = count();
      expect(Number(events)).toBeGreaterThan(0);
      if (!recovered.receipt) throw new Error("Missing recovered receipt.");
      await reader.ingest(recovered.receipt);
      await reader.poll(100);
      expect(count()).toBe(events);
      expect(() =>
        validateExecutionAbi({ ...d, abis: { ...d.abis, NightToken: [] } }),
      ).toThrow("ABI");
      await expect(
        validateDeployment({ ...d, chainId: 1 }, client),
      ).rejects.toThrow("chainId");
      await expect(
        validateDeployment({ ...d, TradeRouter: receiver.address }, client),
      ).rejects.toThrow("code missing");
      expect(() => assertLocalForkRpc("https://rpc.mainnet.arc.io")).toThrow(
        "local",
      );
      const revised = { ...d, block: Number(await client.getBlockNumber()) };
      const revisedFingerprint = await validateDeployment(revised, client);
      expect(revisedFingerprint).not.toBe(fingerprint);
      const newReader = createChainReader(
        db,
        revised,
        client,
        revisedFingerprint,
      );
      const staleExecutor = createChainExecutor({
        db,
        deployment: d,
        client,
        reader: newReader,
        custody: restartedCustody,
      });
      await expect(staleExecutor.recover(request.operationId)).rejects.toThrow(
        "Stale deployment",
      );
    } finally {
      db.close();
      child.kill();
      await child.exited;
      rmSync(dir, { recursive: true });
    }
  },
  120000,
);
