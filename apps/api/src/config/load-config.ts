import { parseDate } from "../shared/dates";
import { loadServerConfig, type ServerConfig } from "./server-config";
export type Config = Partial<ServerConfig> & {
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
  const orderChainId = Number(env.ORDER_CHAIN_ID ?? "5042002");
  if (!Number.isSafeInteger(orderChainId) || orderChainId <= 0)
    throw new Error("ORDER_CHAIN_ID must be a positive safe integer.");
  const orderVerifyingContract =
    env.ORDER_VERIFYING_CONTRACT ??
    "0x0000000000000000000000000000000000000000";
  if (!/^0x[0-9a-fA-F]{40}$/.test(orderVerifyingContract))
    throw new Error("ORDER_VERIFYING_CONTRACT must be an Ethereum address.");
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
  const worldIdEnvironment = env.WORLD_ID_ENVIRONMENT ?? "staging";
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
    ...loadServerConfig(env),
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
