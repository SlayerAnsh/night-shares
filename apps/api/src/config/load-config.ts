import { parseUnits } from "viem";
import { assertOrderDomain } from "../modules/market/orders/typed-data";
import {
  type AgentPassConfig,
  agentPassConfig,
} from "../ports/agent-pass/config";
import { assertMockSecurity } from "../ports/agent-pass/mock-security";
import {
  type ArcDeployment,
  loadDeployment,
} from "../ports/arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../ports/arc-deployment/local-fork";
import { chainConfig } from "../ports/chain-status/config";
import type { GasPolicy } from "../ports/wallet-custody/gas-float";
import { parseDate } from "../shared/dates";
import { registerRpcUrls, rpcJsonReplacer } from "../shared/redact-url";
import { ARC_NETWORKS } from "./arc-networks";
import { loadChainKeys } from "./chain-keys";
import { normalizeEnv } from "./env";
import { assertMainnetLimits } from "./mainnet-limits";
import { loadServerConfig, type ServerConfig } from "./server-config";
export type Config = Partial<ServerConfig> &
  AgentPassConfig & {
    chainExecution?: boolean;
    chain?: { network: "fork" | "testnet" | "mainnet" };
    arcRpcUrls?: string[];
    toJSON?: () => unknown;
    attesterKey?: () => `0x${string}`;
    opsKey?: () => `0x${string}`;
    gasPolicy?: GasPolicy;
    chainLimits?: string;
    chainPaused?: boolean;
    agentApprovalThreshold?: bigint;
    walletCustody?: "mock" | "privy" | "anvil";
    privyAppId?: string;
    privyAppSecret?: string;
    privyAuthorizationKey?: string;
    arcNetwork?: "mainnet" | "testnet" | "fork";
    arcDeployment?: ArcDeployment;
    chainStatus?: "mock" | "onchain";
    forkFaucet?: boolean;
    forkGasHeadroomBps?: number;
    forkAttesterKey?: () => `0x${string}`;
    arcRpcUrl?: string;
    orderChainId?: number;
    orderVerifyingContract?: string;
    orderMockSecret?: string;
    devTagIssuer?: boolean;
    receptionTagSecret?: string;
    jobIntervalMs?: number;
    worldIdMode?: "mock" | "world-id" | "cloud";
    worldIdAppId?: string;
    worldIdRpId?: string;
    worldIdSigningKey?: string;
    worldIdEnvironment?: "staging" | "production";
    worldIdAllowLegacy?: boolean;
    worldIdDeviceCredential?: "selfieCheck" | "proofOfHuman";
    worldIdAction?: string;
    worldIdVerifyUrl?: string;
    port: number;
    adapters: "mock";
    today?: string;
    dbPath?: string;
    clock?: "system" | "mock";
    ids?: "random" | "sequential";
  };
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  env = normalizeEnv(env);
  const walletCustody =
    env.WALLET_CUSTODY ?? (env.ARC_NETWORK === "fork" ? "anvil" : "mock");
  if (
    walletCustody !== "mock" &&
    walletCustody !== "privy" &&
    walletCustody !== "anvil"
  )
    throw new Error("WALLET_CUSTODY must be mock, privy or anvil.");
  const privyAppId = env.PRIVY_APP_ID?.trim();
  const privyAppSecret = env.PRIVY_APP_SECRET?.trim();
  if (walletCustody === "privy" && (!privyAppId || !privyAppSecret))
    throw new Error(
      "PRIVY_APP_ID and PRIVY_APP_SECRET are required in privy mode.",
    );
  const arcNetwork = env.ARC_NETWORK ?? "mainnet";
  if (
    arcNetwork !== "mainnet" &&
    arcNetwork !== "testnet" &&
    arcNetwork !== "fork"
  )
    throw new Error("ARC_NETWORK must be mainnet, testnet or fork.");
  if (walletCustody === "anvil" && arcNetwork !== "fork")
    throw new Error("WALLET_CUSTODY=anvil requires ARC_NETWORK=fork.");
  const execution =
    env.CHAIN_EXECUTION ?? (arcNetwork === "mainnet" ? "off" : "on");
  if (execution !== "off" && execution !== "on")
    throw new Error("CHAIN_EXECUTION must be off or on.");
  const chain: Config["chain"] = env.ARC_NETWORK
    ? { network: arcNetwork }
    : undefined;
  const arcDeployment =
    chain || env.ARC_DEPLOYMENT_FILE
      ? loadDeployment(arcNetwork, env.ARC_DEPLOYMENT_FILE)
      : undefined;
  if (arcDeployment) assertMainnetLimits(arcNetwork, arcDeployment);
  const chainStatus = env.CHAIN_STATUS ?? (chain ? "onchain" : "mock");
  if (chainStatus !== "mock" && chainStatus !== "onchain")
    throw new Error("CHAIN_STATUS must be onchain or mock.");
  if (chainStatus === "onchain" && !arcDeployment)
    throw new Error("CHAIN_STATUS=onchain requires ARC_DEPLOYMENT_FILE.");
  const faucet = env.FORK_FAUCET ?? "false";
  if (faucet !== "true" && faucet !== "false")
    throw new Error("FORK_FAUCET must be true or false.");
  if (faucet === "true" && arcNetwork !== "fork")
    throw new Error("FORK_FAUCET requires ARC_NETWORK=fork.");
  const { attesterKey, opsKey } = loadChainKeys(
    env,
    chain?.network,
    arcDeployment,
  );
  const forkAttesterKey = arcNetwork === "fork" ? attesterKey : undefined;
  const arcRpcUrls = (
    env.ARC_RPC_URLS ??
    env.ARC_RPC_URL ??
    (arcNetwork === "testnet"
      ? "https://rpc.testnet.arc.network,https://rpc.testnet.arc.io"
      : ARC_NETWORKS[arcNetwork].rpcUrl)
  )
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (!arcRpcUrls.length)
    throw new Error("ARC_RPC_URLS must contain an HTTP(S) URL.");
  registerRpcUrls(arcRpcUrls);
  const arcRpcUrl = arcRpcUrls[0] as string;
  for (const rpcUrl of arcRpcUrls) {
    try {
      const url = new URL(rpcUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new Error(
        "ARC_RPC_URL must be an HTTP(S) URL without credentials.",
      );
    }
    if (arcNetwork === "fork") assertLocalForkRpc(rpcUrl);
  }
  if (chain && walletCustody !== "anvil" && walletCustody !== "privy")
    throw new Error(
      "Chain execution requires WALLET_CUSTODY=anvil (fork only) or privy.",
    );
  if (chain && chainStatus !== "onchain")
    throw new Error("Chain execution requires CHAIN_STATUS=onchain.");
  const amount = (name: string, fallback: string) => {
    const value = env[name] ?? fallback;
    if (!/^\d+(?:\.\d{1,18})?$/.test(value) || parseUnits(value, 18) <= 0n)
      throw new Error(
        `${name} must be a positive native USDC amount with at most 18 decimals.`,
      );
    return parseUnits(value, 18);
  };
  const gasPolicy = {
    float: amount("CHAIN_GAS_FLOAT", "0.05"),
    lowWater: amount("CHAIN_GAS_LOW_WATER", "0.01"),
    dailyCap: amount("CHAIN_GAS_DAILY_CAP_PER_WALLET", "0.2"),
    opsMinBalance: amount("CHAIN_OPS_MIN_BALANCE", "0.1"),
  };
  if (
    gasPolicy.lowWater >= gasPolicy.float ||
    gasPolicy.dailyCap < gasPolicy.float
  )
    throw new Error("Gas policy requires low water < float <= daily cap.");
  const forkGasHeadroomBps = Number(
    env.CHAIN_GAS_HEADROOM_BPS ?? env.FORK_GAS_HEADROOM_BPS ?? "12000",
  );
  if (
    !Number.isInteger(forkGasHeadroomBps) ||
    forkGasHeadroomBps < 10000 ||
    forkGasHeadroomBps > 50000
  )
    throw new Error("FORK_GAS_HEADROOM_BPS must be 10000..50000.");
  const orderChainId = Number(
    env.ORDER_CHAIN_ID ?? ARC_NETWORKS[arcNetwork].chainId,
  );
  if (!Number.isSafeInteger(orderChainId) || orderChainId <= 0)
    throw new Error("ORDER_CHAIN_ID must be a positive safe integer.");
  const orderVerifyingContract =
    env.ORDER_VERIFYING_CONTRACT ??
    arcDeployment?.TradeRouter ??
    "0x0000000000000000000000000000000000000000";
  if (!/^0x[0-9a-fA-F]{40}$/.test(orderVerifyingContract))
    throw new Error("ORDER_VERIFYING_CONTRACT must be an Ethereum address.");
  if (arcDeployment)
    assertOrderDomain(
      {
        chainId: orderChainId,
        verifyingContract: orderVerifyingContract as `0x${string}`,
      },
      arcDeployment.EIP712Domain,
    );
  const rawDevTagIssuer = env.DEV_TAG_ISSUER ?? "false";
  if (rawDevTagIssuer !== "true" && rawDevTagIssuer !== "false")
    throw new Error("DEV_TAG_ISSUER must be true or false.");
  const devTagIssuer = rawDevTagIssuer === "true";
  if (devTagIssuer && (env.ADAPTERS ?? "mock") !== "mock")
    throw new Error("DEV_TAG_ISSUER requires ADAPTERS=mock.");
  const receptionTagSecret = env.RECEPTION_TAG_SECRET?.trim() || undefined;
  if ((env.ADAPTERS ?? "mock") !== "mock" && !receptionTagSecret)
    throw new Error(
      "RECEPTION_TAG_SECRET is required when ADAPTERS is not mock.",
    );
  assertMockSecurity({
    adapters: env.ADAPTERS,
    worldIdMode: env.WORLD_ID_MODE,
    walletCustody: env.WALLET_CUSTODY,
    agentPassMode: env.AGENT_PASS_MODE,
    agentApproval: env.AGENT_APPROVAL,
  });
  const jobIntervalMs = Number(env.JOB_INTERVAL_MS ?? "60000");
  if (
    !Number.isSafeInteger(jobIntervalMs) ||
    jobIntervalMs <= 0 ||
    jobIntervalMs > 2147483647
  )
    throw new Error("JOB_INTERVAL_MS must be a positive timer interval.");
  const worldIdMode = env.WORLD_ID_MODE ?? "mock";
  if (
    worldIdMode !== "mock" &&
    worldIdMode !== "world-id" &&
    worldIdMode !== "cloud"
  )
    throw new Error(
      "WORLD_ID_MODE must be mock or cloud (world-id is an alias).",
    );
  const worldIdAppId = env.WORLD_ID_APP_ID ?? "";
  if (worldIdMode !== "mock" && !/^app_[a-zA-Z0-9_]+$/.test(worldIdAppId))
    throw new Error("WORLD_ID_APP_ID must be a valid app ID in world-id mode.");
  const worldIdRpId = env.WORLD_ID_RP_ID ?? "";
  const worldIdSigningKey = env.WORLD_ID_SIGNING_KEY ?? "";
  if (worldIdMode !== "mock" && !/^rp_[a-zA-Z0-9_]+$/.test(worldIdRpId))
    throw new Error("WORLD_ID_RP_ID is required in cloud mode.");
  if (
    worldIdMode !== "mock" &&
    !/^(0x)?[0-9a-fA-F]{64}$/.test(worldIdSigningKey)
  )
    throw new Error(
      "WORLD_ID_SIGNING_KEY must be a 32-byte private key in cloud mode.",
    );
  const worldIdEnvironment =
    env.WORLD_ID_ENVIRONMENT ??
    (worldIdMode === "mock" ? "staging" : "production");
  if (worldIdEnvironment !== "staging" && worldIdEnvironment !== "production")
    throw new Error("WORLD_ID_ENVIRONMENT must be staging or production.");
  const legacy = env.WORLD_ID_ALLOW_LEGACY ?? "true";
  if (legacy !== "true" && legacy !== "false")
    throw new Error("WORLD_ID_ALLOW_LEGACY must be true or false.");
  const worldIdAllowLegacy = legacy === "true";
  const worldIdDeviceCredential =
    env.WORLD_ID_DEVICE_CREDENTIAL ?? "selfieCheck";
  if (
    worldIdDeviceCredential !== "selfieCheck" &&
    worldIdDeviceCredential !== "proofOfHuman"
  )
    throw new Error(
      "WORLD_ID_DEVICE_CREDENTIAL must be selfieCheck or proofOfHuman.",
    );
  const worldIdAction = env.WORLD_ID_ENROLL_ACTION ?? "night-shares-enroll";
  if (!worldIdAction.trim())
    throw new Error("WORLD_ID_ENROLL_ACTION must not be empty.");
  const worldIdVerifyUrl =
    env.WORLD_ID_VERIFY_URL ??
    "https://developer.world.org/api/v4/verify/{rp_id}";
  try {
    const url = new URL(worldIdVerifyUrl.replace("{app_id}", "app_test"));
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error();
  } catch {
    throw new Error("WORLD_ID_VERIFY_URL must be an HTTPS URL.");
  }
  const rawPort = env.PORT ?? "8787";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port > 65535)
    throw new Error("PORT must be an integer from 0 to 65535.");
  if (env.ADAPTERS !== undefined && env.ADAPTERS !== "mock")
    throw new Error("ADAPTERS must be mock.");
  if (env.TODAY !== undefined) {
    try {
      parseDate(env.TODAY);
    } catch {
      throw new Error("TODAY must be a valid YYYY-MM-DD date.");
    }
  }
  const clock = env.CLOCK ?? "system";
  if (clock !== "system" && clock !== "mock")
    throw new Error("CLOCK must be system or mock.");
  const ids = env.IDS ?? "random";
  if (ids !== "random" && ids !== "sequential")
    throw new Error("IDS must be random or sequential.");
  const dbPath = env.DB_PATH ?? "./data/night-shares.db";
  if (!dbPath.trim() || dbPath.includes("\0"))
    throw new Error("DB_PATH must be a nonempty SQLite file path or :memory:.");
  return {
    toJSON() {
      const { toJSON: _toJSON, ...config } = this;
      return JSON.parse(JSON.stringify(config, rpcJsonReplacer));
    },
    ...loadServerConfig(env),
    ...chainConfig(env),
    ...agentPassConfig(env),
    walletCustody,
    privyAppId,
    privyAppSecret,
    privyAuthorizationKey: env.PRIVY_AUTHORIZATION_KEY?.trim() || undefined,
    chain,
    chainExecution: execution === "on",
    attesterKey,
    opsKey,
    gasPolicy,
    arcRpcUrls,
    arcNetwork,
    arcDeployment,
    chainStatus,
    forkFaucet: faucet === "true",
    forkGasHeadroomBps,
    forkAttesterKey,
    arcRpcUrl,
    orderChainId,
    orderVerifyingContract,
    orderMockSecret: env.ORDER_MOCK_SECRET || undefined,
    receptionTagSecret,
    devTagIssuer,
    jobIntervalMs,
    worldIdMode,
    worldIdRpId,
    worldIdSigningKey,
    worldIdEnvironment,
    worldIdAllowLegacy,
    worldIdDeviceCredential,
    worldIdAppId,
    worldIdAction,
    worldIdVerifyUrl,
    port,
    adapters: "mock",
    today: env.TODAY,
    dbPath,
    clock,
    ids,
  };
}
