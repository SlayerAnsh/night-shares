import { parseDate } from "../shared/dates";
import { loadServerConfig, type ServerConfig } from "./server-config";
export type Config = Partial<ServerConfig> & {
  devTagIssuer?: boolean;
  receptionTagSecret?: string;
  jobIntervalMs?: number;
  worldIdMode?: "mock" | "world-id";
  worldIdAppId?: string;
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
  if (worldIdMode !== "mock" && worldIdMode !== "world-id")
    throw new Error("WORLD_ID_MODE must be mock or world-id.");
  const worldIdAppId = env.WORLD_ID_APP_ID ?? "";
  if (worldIdMode === "world-id" && !/^app_[a-zA-Z0-9_]+$/.test(worldIdAppId))
    throw new Error("WORLD_ID_APP_ID must be a valid app ID in world-id mode.");
  const worldIdAction = env.WORLD_ID_ACTION ?? "night-shares-human";
  if (!worldIdAction.trim())
    throw new Error("WORLD_ID_ACTION must not be empty.");
  const worldIdVerifyUrl =
    env.WORLD_ID_VERIFY_URL ??
    "https://developer.world.org/api/v2/verify/{app_id}";
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
    receptionTagSecret,
    devTagIssuer,
    jobIntervalMs,
    worldIdMode,
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
