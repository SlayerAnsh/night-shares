import { Database } from "bun:sqlite";
import { ARC_NETWORKS } from "../config/arc-networks";
import { preflightReason, runPreflight } from "../container/chain-preflight";
import { migrate } from "../db/migrate";
import { loadDeployment } from "../ports/arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../ports/arc-deployment/local-fork";
import type { ForkClient } from "../ports/arc-deployment/validate";
import { chainClient } from "../ports/arc-deployment/validate";
import type { ChainReader } from "../ports/chain-reader/chain-reader";
import { createChainReader } from "../ports/chain-reader/chain-reader.viem";
import { redactRpc } from "../shared/redact-url";

/** Scan to the head observed at entry without running transaction-producing jobs. */
export async function catchUp(
  reader: ChainReader,
  db: Database,
  deploymentBlock: bigint,
) {
  const started = performance.now();
  await reader.ready;
  const target = (await reader.head()).number;
  let indexed = await reader.poll();
  while (indexed.number < target) indexed = await reader.poll();
  const count = (table: string) =>
    Number(
      db
        .query<{ n: bigint }, [string]>(
          `SELECT count(*) AS n FROM ${table} WHERE fingerprint = ?`,
        )
        .get(reader.fingerprint)?.n ?? 0,
    );
  return {
    blocksScanned: Math.max(0, Number(indexed.number - deploymentBlock + 1n)),
    logsIngested: count("chain_events"),
    nightsProjected: count("chain_nights"),
    elapsedSeconds: (performance.now() - started) / 1000,
  };
}

// Load only read-only chain configuration; diagnostics never require signing keys.
export async function chainCheck(
  env: Record<string, string | undefined> = process.env,
  dependencies = { loadDeployment, runPreflight },
  client?: ForkClient,
  catchup = false,
) {
  const warnings: string[] = [];
  let fingerprint: string | null = null;
  let x402Available: boolean | null = null;
  const network = env.ARC_NETWORK ?? "mainnet";
  const rpcUrls = (
    env.ARC_RPC_URLS ??
    env.ARC_RPC_URL ??
    (network === "testnet"
      ? "https://rpc.testnet.arc.network,https://rpc.testnet.arc.io"
      : (ARC_NETWORKS[network as keyof typeof ARC_NETWORKS]?.rpcUrl ?? ""))
  )
    .split(",")
    .map((url) => url.trim());
  try {
    if (network !== "fork" && network !== "testnet" && network !== "mainnet")
      throw new Error("ARC_NETWORK must be mainnet, testnet or fork.");
    for (const url of rpcUrls) {
      const parsed = new URL(url);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw new Error(
          "ARC_RPC_URL must be an HTTP(S) URL without credentials.",
        );
      if (network === "fork") assertLocalForkRpc(url);
    }
    const deployment = dependencies.loadDeployment(
      network,
      env.ARC_DEPLOYMENT_FILE,
    );
    if (!deployment) throw new Error("Chain deployment is required.");
    x402Available = deployment.x402Available;
    fingerprint = await dependencies.runPreflight(
      { deployment, rpcUrls, chainId: ARC_NETWORKS[network].chainId },
      client,
      (message) => warnings.push(message),
    );
    let catchupStats: Record<string, number> | undefined;
    if (catchup) {
      const db = new Database(":memory:", { safeIntegers: true });
      try {
        migrate(db);
        const reader = createChainReader(
          db,
          deployment,
          client ?? chainClient(rpcUrls, deployment.chainId),
          fingerprint,
        );
        catchupStats = await catchUp(reader, db, BigInt(deployment.block ?? 0));
      } finally {
        db.close();
      }
    }
    return redactRpc(
      {
        status: "ok",
        network,
        fingerprint,
        x402Available,
        warnings,
        ...(catchupStats ? { catchup: catchupStats } : {}),
      },
      rpcUrls,
    );
  } catch (error) {
    return redactRpc(
      {
        status: "unavailable",
        network,
        fingerprint,
        x402Available,
        warnings,
        reason: preflightReason(error, rpcUrls),
      },
      rpcUrls,
    );
  }
}

if (import.meta.main) {
  const result = await chainCheck(
    process.env,
    undefined,
    undefined,
    process.argv.includes("--catchup"),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "ok" ? 0 : 1;
}
