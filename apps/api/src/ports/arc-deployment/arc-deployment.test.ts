import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../../config/load-config";
import { assertOrderDomain } from "../../modules/market/orders/typed-data";
import { loadDeployment, parseDeployment } from "./arc-deployment";
import { fixture } from "./fixture";

test("deployment validates addresses, required fields, chain and authoritative domain", () => {
  expect(parseDeployment(fixture()).chainId).toBe(5042);
  expect(() => parseDeployment({ ...fixture(), chainId: 1 })).toThrow(
    "chainId",
  );
  expect(() => parseDeployment({ ...fixture(), USDC: "bad" })).toThrow("USDC");
  expect(() => parseDeployment({ ...fixture(), USDC: undefined })).toThrow(
    "USDC",
  );
  expect(() =>
    parseDeployment({ ...fixture(), USDC: `0xaB${"ab".repeat(19)}` }),
  ).toThrow("checksummed");
  expect(() =>
    loadDeployment("fork", "/nonexistent/arc-deployment.json"),
  ).toThrow("ARC_DEPLOYMENT_FILE missing");
  const domain = fixture().EIP712Domain;
  expect(() => assertOrderDomain(domain, domain)).not.toThrow();
  for (const changed of [
    { ...domain, name: "Other" },
    { ...domain, version: "2" },
    { ...domain, chainId: 1 },
    { ...domain, verifyingContract: `0x${"11".repeat(20)}` as const },
  ])
    expect(() => assertOrderDomain(domain, changed)).toThrow("domain");
});
test("fork config selects deployment domain, refuses modes and hides attester", () => {
  const dir = mkdtempSync(join(tmpdir(), "arc-config-"));
  const file = join(dir, "deployment.json");
  writeFileSync(file, JSON.stringify(fixture()));
  try {
    const env = { ARC_NETWORK: "fork", ARC_DEPLOYMENT_FILE: file };
    const config = loadConfig(env);
    expect(config.chainStatus).toBe("onchain");
    expect(config.arcRpcUrl).toBe("http://127.0.0.1:8545");
    expect(config.orderVerifyingContract).toBe(
      fixture().EIP712Domain.verifyingContract,
    );
    expect(config.forkFaucet).toBe(false);
    const secret = `0x${"01".repeat(32)}` as const;
    writeFileSync(
      file,
      JSON.stringify({
        ...fixture(),
        ATTESTER: privateKeyToAccount(secret).address,
      }),
    );
    const secretConfig = loadConfig({ ...env, FORK_ATTESTER_KEY: secret });
    expect(secretConfig.forkAttesterKey?.() === secret).toBe(true);
    const serialized = JSON.stringify(secretConfig, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    expect(serialized.includes(secret)).toBe(false);
    expect(JSON.parse(serialized).forkAttesterKey).toBe("[REDACTED]");
    expect(() => loadConfig({ ...env, ORDER_CHAIN_ID: "1" })).toThrow("domain");
    expect(() => loadConfig({ ...env, CHAIN_STATUS: "bad" })).toThrow(
      "CHAIN_STATUS",
    );
    expect(() => loadConfig({ WALLET_CUSTODY: "anvil" })).toThrow("requires");
    expect(() => loadConfig({ FORK_FAUCET: "true" })).toThrow("requires");
    expect(
      loadConfig({ FORK_ATTESTER_KEY: "invalid" }).forkAttesterKey,
    ).toBeUndefined();
    expect(() => loadConfig({ ...env, FORK_ATTESTER_KEY: "invalid" })).toThrow(
      "ATTESTER_KEY",
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("network deployment selection loads the committed testnet and mainnet files", () => {
  const testnet = loadDeployment("testnet");
  expect(testnet?.chainId).toBe(5042002);
  expect(testnet?.block).toBeGreaterThan(0);
  expect(testnet?.x402Available).toBe(true);
  // Mainnet carries the x402 set. Its demo night comes from the smoke run
  // (db89e67) and expires, so only its shape is asserted here.
  const mainnet = loadDeployment("mainnet");
  expect(mainnet?.chainId).toBe(5042);
  expect(mainnet?.x402Available).toBe(true);
  if (mainnet?.demoNight !== undefined) {
    expect(mainnet.demoNight).toMatch(/^0x[0-9a-f]{64}$/);
    expect(mainnet.NightToken).not.toBe(
      "0x0000000000000000000000000000000000000000",
    );
  }
});

test("mainnet deployment requires neither NightToken nor demoNight", () => {
  const data = parseDeployment({
    ...fixture(),
    NightToken: undefined,
    demoNight: undefined,
  });
  expect(data.NightToken).toBe("0x0000000000000000000000000000000000000000");
  expect(data.demoNight).toBeUndefined();
});
