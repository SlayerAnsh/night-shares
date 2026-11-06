import { parseProxyRange } from "../server/limits/ip-address";

export type ServerConfig = ReturnType<typeof loadServerConfig>;

export function loadServerConfig(env: Record<string, string | undefined> = {}) {
  const integer = (key: string, fallback: number) => {
    const raw = env[key] ?? String(fallback);
    const value = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > 2_147_483_647
    )
      throw new Error(`${key} must be a positive integer at most 2147483647.`);
    return value;
  };
  const boolean = (key: string, fallback: boolean) => {
    const value = env[key] ?? String(fallback);
    if (value !== "true" && value !== "false")
      throw new Error(`${key} must be true or false.`);
    return value === "true";
  };
  const logLevel = env.LOG_LEVEL ?? "info";
  if (
    logLevel !== "debug" &&
    logLevel !== "info" &&
    logLevel !== "warn" &&
    logLevel !== "error" &&
    logLevel !== "silent"
  )
    throw new Error("LOG_LEVEL must be debug, info, warn, error or silent.");
  const corsOrigins = (env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
        throw new Error();
    } catch {
      throw new Error(
        "CORS_ORIGINS must contain comma-separated HTTP origins.",
      );
    }
  }
  const trustedProxies = (env.TRUSTED_PROXIES ?? "").trim()
    ? (env.TRUSTED_PROXIES ?? "").split(",").map((value) => value.trim())
    : [];
  if (trustedProxies.some((range) => !parseProxyRange(range)))
    throw new Error(
      "TRUSTED_PROXIES must contain comma-separated IP addresses or CIDRs.",
    );
  return {
    trustedProxyHops: integer("TRUSTED_PROXY_HOPS", 1),
    trustedProxies,
    logLevel: logLevel as "debug" | "info" | "warn" | "error" | "silent",
    corsOrigins,
    trustProxy: boolean("TRUST_PROXY", false),
    rateLimitEnabled: boolean("RATE_LIMIT_ENABLED", true),
    rateLimitPerIp: integer("RATE_LIMIT_PER_IP", 120),
    rateLimitPerUser: integer("RATE_LIMIT_PER_USER", 120),
    rateLimitIdentity: integer("RATE_LIMIT_IDENTITY", 10),
    rateLimitWindowMs: integer("RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMaxBuckets: integer("RATE_LIMIT_MAX_BUCKETS", 10_000),
    maxRequestBodyBytes: integer("MAX_REQUEST_BODY_BYTES", 65_536),
    connectReadMaxBytes: integer("CONNECT_READ_MAX_BYTES", 65_536),
    requestTimeoutMs: integer("REQUEST_TIMEOUT_MS", 30_000),
    shutdownTimeoutMs: integer("SHUTDOWN_TIMEOUT_MS", 10_000),
  };
}
