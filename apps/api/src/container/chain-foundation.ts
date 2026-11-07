import type { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import type { Config } from "../config/load-config";
import { assertLocalForkRpc } from "../ports/arc-deployment/local-fork";
import {
  chainClient,
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
import { createPrivyWalletCustody } from "../ports/wallet-custody/wallet-custody.privy";
import { persistWalletCustody } from "../ports/wallet-custody/wallet-custody.sqlite";
import { createForkWalletProvider } from "../ports/wallet-provider/wallet-provider.fork";
export function createChainFoundation(config: Config, db: Database) {
  const network = config.chain?.network ?? config.arcNetwork;
  if (!network) throw new Error("Chain network is required.");
  if (config.walletCustody !== "anvil" && config.walletCustody !== "privy")
    throw new Error("Chain execution requires anvil or privy custody.");
  if (config.walletCustody === "anvil" && network !== "fork")
    throw new Error("Anvil custody requires ARC_NETWORK=fork.");
  const d = config.arcDeployment;
  if (!d || !config.arcRpcUrl)
    throw new Error(
      "Chain execution requires deployment and RPC configuration.",
    );
  validateExecutionAbi(d);
  const getKey = config.attesterKey ?? config.forkAttesterKey;
  if (!getKey && network !== "fork")
    throw new Error(
      "ATTESTER_KEYSTORE and ATTESTER_KEYCHAIN_SERVICE are required for chain startup.",
    );
  const signing = getKey ? createChainAttester(d, getKey) : undefined;
  const rpcUrls = config.arcRpcUrls ?? [config.arcRpcUrl];
  if (network === "fork") for (const url of rpcUrls) assertLocalForkRpc(url);
  if (network !== "fork" && config.forkFaucet)
    throw new Error("FORK_FAUCET requires ARC_NETWORK=fork.");
  const client = chainClient(rpcUrls, d.chainId);
  const checked = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./chain-preflight.ts", import.meta.url))],
    {
      input: JSON.stringify({ deployment: d, rpcUrls }, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
      encoding: "utf8",
      timeout: 120000,
      env: { PATH: process.env.PATH },
    },
  );
  if (checked.status !== 0 || !/^[a-f0-9]{64}$/.test(checked.stdout))
    throw new Error("Chain deployment preflight failed; API startup refused.");
  const reader = createChainReader(db, d, client, checked.stdout);
  let provision: ((wallet: CustodyWallet) => Promise<void>) | undefined;
  const adapter =
    config.walletCustody === "anvil"
      ? createAnvilWalletCustody({
          db,
          network: "fork",
          deployment: d,
          rpcUrl: config.arcRpcUrl,
          faucet: config.forkFaucet,
          provision: async (wallet) => {
            if (!provision) throw new Error("Provisioner unavailable.");
            await provision(wallet);
          },
        })
      : persistWalletCustody(
          db,
          "privy",
          createPrivyWalletCustody({
            appId: config.privyAppId ?? "",
            appSecret: config.privyAppSecret ?? "",
            authorizationKey: config.privyAuthorizationKey,
          }),
        );
  const custody: WalletCustody = {
    ...adapter,
    async resolveWallet(id) {
      const resolved = await ((id === "chain:attester" ||
        id === "fork:attester") &&
      signing
        ? signing.custody
        : adapter
      ).resolveWallet?.(id);
      if (!resolved) throw new Error("Execution wallet unavailable.");
      return resolved;
    },
    async signTransaction(id, tx) {
      const signed = await ((id === "chain:attester" ||
        id === "fork:attester") &&
      signing
        ? signing.custody
        : adapter
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
    network,
    sendingUnavailable: config.walletCustody === "privy",
  });
  if (network === "fork" && config.walletCustody === "anvil")
    provision = forkProvisioner({
      db,
      rpcUrl: config.arcRpcUrl,
      client,
      reader,
      fingerprint: reader.fingerprint,
      executor,
    });
  return {
    client,
    chainExecutor: executor,
    chainReader: reader,
    chainAttester: signing?.attester,
    provisionWallet: provision,
    custody,
    walletProvider: createForkWalletProvider(custody, reader),
  };
}
