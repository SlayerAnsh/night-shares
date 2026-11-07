import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { repoRoot } from "../ports/arc-deployment/arc-deployment";
import { chainConfig } from "../ports/chain-status/config";
import { executionEnabled } from "./chain-execution";
import { loadConfig } from "./load-config";

const limits = {
  MAX_F: 1_000_000,
  MAX_POOL: 50_000_000,
  MAX_S: 100,
  MAX_OPEN_NIGHTS: 20,
};
test("mainnet config uses a disposable deployment, default off, strict limits, x402 and existing key sources", () => {
  const dir = mkdtempSync(join(tmpdir(), "mainnet-config-"));
  const path = join(dir, "5042.json");
  const key = `0x${"12".repeat(32)}` as const;
  const fixture = JSON.parse(
    readFileSync(
      join(repoRoot, "packages/contracts/deployments/5042002.json"),
      "utf8",
    ),
  );
  fixture.chainId = 5042;
  fixture.EIP712Domain.chainId = 5042;
  fixture.ATTESTER = privateKeyToAccount(key).address;
  fixture.constructorConfig = limits;
  const env = {
    ARC_NETWORK: "mainnet",
    ARC_DEPLOYMENT_FILE: path,
    WALLET_CUSTODY: "privy",
    PRIVY_APP_ID: "dummy",
    PRIVY_APP_SECRET: "dummy",
    ATTESTER_KEY: key,
    OPS_KEY: key,
  };
  try {
    writeFileSync(path, JSON.stringify(fixture));
    const config = loadConfig(env);
    expect(config).toMatchObject({
      chainExecution: false,
      chainLimits: "mainnet",
      agentApprovalThreshold: 10_000_000n,
      arcRpcUrls: ["https://rpc.mainnet.arc.io"],
    });
    expect(config.arcDeployment?.x402Available).toBe(true);
    expect(config.attesterKey?.()).toBe(key);
    expect(config.opsKey?.()).toBe(key);
    expect(config.gasPolicy).toEqual({
      float: 50_000_000_000_000_000n,
      lowWater: 10_000_000_000_000_000n,
      dailyCap: 200_000_000_000_000_000n,
      opsMinBalance: 100_000_000_000_000_000n,
    });
    expect(loadConfig({ ...env, CHAIN_EXECUTION: "on" }).chainExecution).toBe(
      true,
    );
    expect(
      loadConfig({ ...env, ARC_RPC_URLS: "http://127.0.0.1:1" }).arcRpcUrls,
    ).toEqual(["http://127.0.0.1:1"]);
    expect(() => loadConfig({ ...env, CHAIN_EXECUTION: "true" })).toThrow(
      "CHAIN_EXECUTION",
    );
    for (const name of Object.keys(limits)) {
      writeFileSync(
        path,
        JSON.stringify({
          ...fixture,
          constructorConfig: { ...limits, [name]: 0 },
        }),
      );
      expect(() => loadConfig(env)).toThrow(`constructorConfig.${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("execution and safety defaults follow network", () => {
  expect(executionEnabled({ chain: { network: "mainnet" } })).toBe(false);
  for (const network of ["fork", "testnet"])
    expect(executionEnabled({ chain: { network } })).toBe(true);
  expect(chainConfig({ ARC_NETWORK: "mainnet" }).chainLimits).toBe("mainnet");
  expect(chainConfig({ ARC_NETWORK: "testnet" }).chainLimits).toBe("off");
});
