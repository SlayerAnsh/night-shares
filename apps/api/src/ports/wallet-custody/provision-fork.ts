import type { Database } from "bun:sqlite";
import { toHex } from "viem";
import { assertLocalForkRpc } from "../arc-deployment/local-fork";
import type { ForkClient } from "../arc-deployment/validate";
import type { ChainExecutor } from "../chain-executor/chain-executor";
import type { ChainReader } from "../chain-reader/chain-reader";
import type { CustodyWallet } from "./wallet-custody";
export function forkProvisioner(deps: {
  db: Database;
  rpcUrl: string;
  client: ForkClient;
  fingerprint: string;
  executor: ChainExecutor;
  reader: ChainReader;
  nativeAmount?: bigint;
  tokenAmount?: bigint;
}) {
  assertLocalForkRpc(deps.rpcUrl);
  return async (wallet: CustodyWallet) => {
    await deps.reader.assertCurrent();
    if ((await deps.client.getChainId()) !== 5042)
      throw new Error("Fork provisioning chainId must equal 5042.");
    const { db, fingerprint } = deps;
    db.query(
      "INSERT OR IGNORE INTO chain_provisioning (fingerprint,wallet_id) VALUES (?, ?)",
    ).run(fingerprint, wallet.walletId);
    const row = db
      .query<
        { native_ready: number | bigint; token_ready: number | bigint },
        [string, string]
      >(
        "SELECT native_ready,token_ready FROM chain_provisioning WHERE fingerprint = ? AND wallet_id = ?",
      )
      .get(fingerprint, wallet.walletId);
    const native = deps.nativeAmount ?? 10n ** 19n;
    if (
      (await deps.client.getBalance({ address: wallet.address })) <
      native / 10n
    ) {
      // This idempotent fixture mutation funds 18-decimal native gas, not ERC-20 cash.
      const response = await fetch(deps.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "anvil_setBalance",
          params: [wallet.address, toHex(native)],
        }),
      });
      const result = (await response.json()) as { error?: unknown };
      if (!response.ok || result.error)
        throw new Error("Fork native funding failed; retry provisioning.");
      if (
        (await deps.client.getBalance({ address: wallet.address })) <
        native / 10n
      )
        throw new Error("Fork native funding read-back failed.");
    }
    db.query(
      "UPDATE chain_provisioning SET native_ready = 1 WHERE fingerprint = ? AND wallet_id = ?",
    ).run(fingerprint, wallet.walletId);
    if (!Number(row?.token_ready)) {
      const result = await deps.executor.execute({
        operationId: `provision:${fingerprint}:${wallet.walletId}`,
        walletId: wallet.walletId,
        command: {
          kind: "provisionToken",
          to: wallet.address,
          amount: deps.tokenAmount ?? 100_000_000n,
        },
      });
      if (result.state !== "finalized")
        throw new Error("Fork token provisioning pending; retry provisioning.");
      db.query(
        "UPDATE chain_provisioning SET token_ready = 1 WHERE fingerprint = ? AND wallet_id = ?",
      ).run(fingerprint, wallet.walletId);
    }
  };
}
