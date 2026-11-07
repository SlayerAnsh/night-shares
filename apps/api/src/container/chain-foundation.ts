import type { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import {
  assertChainExecution,
  executionEnabled,
} from "../config/chain-execution";
import type { Config } from "../config/load-config";
import { assertMainnetLimits } from "../config/mainnet-limits";
import { assertLocalForkRpc } from "../ports/arc-deployment/local-fork";
import {
  chainClient,
  validateExecutionAbi,
} from "../ports/arc-deployment/validate";
import { createChainAttester } from "../ports/chain-attester/chain-attester";
import { createChainExecutor } from "../ports/chain-executor/chain-executor.viem";
import { createChainReader } from "../ports/chain-reader/chain-reader.viem";
import { createGasFloat } from "../ports/wallet-custody/gas-float";
import { forkProvisioner } from "../ports/wallet-custody/provision-fork";
import type {
  CustodyWallet,
  WalletCustody,
} from "../ports/wallet-custody/wallet-custody";
import { createAnvilWalletCustody } from "../ports/wallet-custody/wallet-custody.anvil";
import { createPrivyWalletCustody } from "../ports/wallet-custody/wallet-custody.privy";
import { persistWalletCustody } from "../ports/wallet-custody/wallet-custody.sqlite";
import { createForkWalletProvider } from "../ports/wallet-provider/wallet-provider.fork";
import { preflightFingerprint, preflightReason } from "./chain-preflight";
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
  assertMainnetLimits(network, d);
  const enabled = executionEnabled(config);
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
    [
      "--no-env-file",
      fileURLToPath(new URL("./chain-preflight.ts", import.meta.url)),
    ],
    {
      input: JSON.stringify({ deployment: d, rpcUrls }, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
      encoding: "utf8",
      timeout: 120000,
      env: { PATH: process.env.PATH },
    },
  );
  const fingerprint = preflightFingerprint(checked, rpcUrls);
  if (checked.stderr?.trim())
    console.warn(preflightReason(checked.stderr, rpcUrls));
  const reader = createChainReader(db, d, client, fingerprint);
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
  const ops = config.opsKey ? privateKeyToAccount(config.opsKey()) : undefined;
  if (config.walletCustody === "privy" && (!ops || !config.gasPolicy))
    throw new Error(
      "Privy chain execution requires OPS_KEYSTORE with a password source or OPS_KEY and a gas policy.",
    );
  const custody: WalletCustody = {
    ...adapter,
    async resolveWallet(id) {
      if (id === "chain:ops" && ops)
        return { walletId: id, address: ops.address };
      const resolved = await ((id === "chain:attester" ||
        id === "fork:attester") &&
      signing
        ? signing.custody
        : adapter
      ).resolveWallet?.(id);
      if (!resolved) throw new Error("Execution wallet unavailable.");
      return resolved;
    },
    async signTypedData(id, data) {
      assertChainExecution(enabled);
      return adapter.signTypedData(id, data);
    },
    async signTransaction(id, tx) {
      assertChainExecution(enabled);
      if (id === "chain:ops" && ops) return ops.signTransaction(tx);
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
    executionEnabled: enabled,
    gasHeadroomBps: config.forkGasHeadroomBps,
    network,
    provisionWallet:
      config.walletCustody === "privy"
        ? async (wallet) => {
            await provision?.(wallet);
          }
        : undefined,
  });
  const gasFloat =
    ops && config.gasPolicy && config.walletCustody === "privy"
      ? createGasFloat({
          db,
          fingerprint: reader.fingerprint,
          opsAddress: ops.address,
          policy: config.gasPolicy,
          getBalance: (address) => client.getBalance({ address }),
          executor,
        })
      : undefined;
  if (gasFloat) provision = gasFloat.provision;
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
    chainReadiness: enabled ? gasFloat?.readiness : undefined,
    chainExecutor: executor,
    chainReader: reader,
    chainAttester: signing
      ? {
          address: signing.attester.address,
          async sign(attestation: Parameters<typeof signing.attester.sign>[0]) {
            assertChainExecution(enabled);
            return signing.attester.sign(attestation);
          },
        }
      : undefined,
    provisionWallet: provision,
    custody,
    walletProvider: createForkWalletProvider(custody, reader),
  };
}
