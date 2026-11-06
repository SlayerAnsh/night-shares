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
    PORT: "",
    DB_PATH: " ",
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
  expect(loadConfig({ ARC_NETWORK: "testnet" })).toMatchObject({
    orderChainId: 5042002,
    arcRpcUrl: "https://rpc.testnet.arc.io",
  });
  expect(
    loadConfig({
      ARC_NETWORK: "testnet",
      ORDER_CHAIN_ID: "5042",
      ARC_RPC_URL: "https://rpc.example.com",
    }),
  ).toMatchObject({ orderChainId: 5042, arcRpcUrl: "https://rpc.example.com" });
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
