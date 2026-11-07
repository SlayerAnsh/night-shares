import { expect, test } from "bun:test";
import { loadConfig } from "./load-config";

test("boot defaults use SQLite, system time and random ids", () => {
  expect(loadConfig({})).toMatchObject({
    jobIntervalMs: 60000,
    port: 8787,
    adapters: "mock",
    today: undefined,
    dbPath: "./data/night-shares.db",
    clock: "system",
    ids: "random",
  });
});
test("invalid environment values fail with their config key", () => {
  for (const [key, value] of Object.entries({
    JOB_INTERVAL_MS: "0",
    PORT: "invalid",
    DB_PATH: "\0",
    TODAY: "2026-02-30",
    CLOCK: "fixed",
    IDS: "counter",
    ADAPTERS: "real",
  })) {
    expect(() => loadConfig({ [key]: value })).toThrow(key);
  }
  expect(
    loadConfig({
      PORT: "0",
      DB_PATH: ":memory:",
      CLOCK: "mock",
      IDS: "sequential",
    }).port,
  ).toBe(0);
});

test("custody credentials fail closed and Arc order defaults follow network", () => {
  expect(loadConfig({})).toMatchObject({
    walletCustody: "mock",
    arcNetwork: "mainnet",
    arcRpcUrl: "https://rpc.mainnet.arc.io",
    orderChainId: 5042,
  });
  expect(() => loadConfig({ ARC_NETWORK: "testnet" })).toThrow(
    "ATTESTER_KEYSTORE",
  );
  expect(() =>
    loadConfig({
      ARC_NETWORK: "mainnet",
      ARC_DEPLOYMENT_FILE:
        "/private/tmp/r18m-intentionally-missing-deployment.json",
    }),
  ).toThrow("ARC_DEPLOYMENT_FILE missing");
  for (const key of ["WALLET_CUSTODY", "ARC_NETWORK", "ARC_RPC_URL"])
    expect(() => loadConfig({ [key]: "bad" })).toThrow(key);
  expect(() => loadConfig({ WALLET_CUSTODY: "privy" })).toThrow("PRIVY_APP_ID");
  expect(() =>
    loadConfig({ WALLET_CUSTODY: "privy", PRIVY_APP_ID: "app" }),
  ).toThrow("PRIVY_APP_SECRET");
  expect(
    loadConfig({
      WALLET_CUSTODY: "privy",
      PRIVY_APP_ID: "app",
      PRIVY_APP_SECRET: "secret",
    }).walletCustody,
  ).toBe("privy");
});

test("blank env values use defaults while false and zero remain explicit", () => {
  for (const blank of ["", " \t\n "]) {
    expect(
      loadConfig({
        ARC_RPC_URLS: blank,
        ARC_NETWORK: blank,
        WORLD_ID_MODE: blank,
        PORT: blank,
        DB_PATH: blank,
        JOB_INTERVAL_MS: blank,
        AGENT_PASS_ISSUER: blank,
        AGENT_PASS_ACR: blank,
      }),
    ).toMatchObject({
      arcRpcUrls: ["https://rpc.mainnet.arc.io"],
      worldIdMode: "mock",
      port: 8787,
      dbPath: "./data/night-shares.db",
      jobIntervalMs: 60000,
      agentPassIssuer: "https://auth.world.org",
      agentPassAcr: "https://world.org/oidc/acr/orb",
    });
  }
  expect(
    loadConfig({ PORT: " 0 ", RATE_LIMIT_ENABLED: " false " }),
  ).toMatchObject({
    port: 0,
    rateLimitEnabled: false,
  });
  expect(
    loadConfig({ ARC_RPC_URLS: "", ARC_RPC_URL: " https://rpc.example " })
      .arcRpcUrl,
  ).toBe("https://rpc.example");
});

test("comma lists discard empty entries", () => {
  expect(
    loadConfig({
      ARC_RPC_URLS: "https://a.example,, https://b.example,",
      CORS_ORIGINS: "https://a.example,,https://b.example,",
      TRUSTED_PROXIES: "127.0.0.1,,::1,",
    }),
  ).toMatchObject({
    arcRpcUrls: ["https://a.example", "https://b.example"],
    corsOrigins: ["https://a.example", "https://b.example"],
    trustedProxies: ["127.0.0.1", "::1"],
  });
  expect(() => loadConfig({ ARC_RPC_URLS: ", ," })).toThrow("ARC_RPC_URLS");
});
