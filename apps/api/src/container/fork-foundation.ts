import type { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Config } from "../config/load-config";
import {
  forkClient,
  validateExecutionAbi,
} from "../ports/arc-deployment/validate";
import { createChainAttester } from "../ports/chain-attester/chain-attester";
import { createChainExecutor } from "../ports/chain-executor/chain-executor.viem";
import { createChainReader } from "../ports/chain-reader/chain-reader.viem";
import { forkProvisioner } from "../ports/wallet-custody/provision-fork";
import type {
  CustodyWallet,
  WalletCustody,
} from "../ports/wallet-custody/wallet-custody";
import { createAnvilWalletCustody } from "../ports/wallet-custody/wallet-custody.anvil";
import { createForkWalletProvider } from "../ports/wallet-provider/wallet-provider.fork";
export function createForkFoundation(config: Config, db: Database) {
  if (config.walletCustody !== "anvil")
    throw new Error("Fork execution requires WALLET_CUSTODY=anvil.");
  const d = config.arcDeployment;
  if (!d || !config.arcRpcUrl)
    throw new Error(
      "Fork execution requires deployment and RPC configuration.",
    );
  validateExecutionAbi(d);
  const client = forkClient(config.arcRpcUrl);
  const checked = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./fork-preflight.ts", import.meta.url))],
    {
      input: JSON.stringify(
        { deployment: d, rpcUrl: config.arcRpcUrl },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
      encoding: "utf8",
      timeout: 30000,
      env: { PATH: process.env.PATH },
    },
  );
  if (checked.status !== 0 || !/^[a-f0-9]{64}$/.test(checked.stdout))
    throw new Error("Fork deployment preflight failed; API startup refused.");
  const reader = createChainReader(db, d, client, checked.stdout);
  let provision: ((wallet: CustodyWallet) => Promise<void>) | undefined;
  const anvil = createAnvilWalletCustody({
    db,
    network: "fork",
    deployment: d,
    rpcUrl: config.arcRpcUrl,
    faucet: config.forkFaucet,
    provision: async (wallet) => {
      if (!provision) throw new Error("Provisioner unavailable.");
      await provision(wallet);
    },
  });
  const signing = config.forkAttesterKey
    ? createChainAttester(d, config.forkAttesterKey)
    : undefined;
  const custody: WalletCustody = {
    ...anvil,
    async resolveWallet(id) {
      const resolved = await (id === "fork:attester" && signing
        ? signing.custody
        : anvil
      ).resolveWallet?.(id);
      if (!resolved) throw new Error("Execution wallet unavailable.");
      return resolved;
    },
    async signTransaction(id, tx) {
      const signed = await (id === "fork:attester" && signing
        ? signing.custody
        : anvil
      ).signTransaction?.(id, tx);
      if (!signed) throw new Error("Execution signer unavailable.");
      return signed;
    },
  };
  const executor = createChainExecutor({
    db,
    deployment: d,
    client,
    reader,
    custody,
    gasHeadroomBps: config.forkGasHeadroomBps,
  });
  provision = forkProvisioner({
    db,
    rpcUrl: config.arcRpcUrl,
    client,
    reader,
    fingerprint: reader.fingerprint,
    executor,
  });
  return {
    chainExecutor: executor,
    chainReader: reader,
    chainAttester: signing?.attester,
    provisionWallet: provision,
    custody,
    walletProvider: createForkWalletProvider(custody, reader),
  };
}
