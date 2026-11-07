import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptKeystoreJsonSync } from "ethers";
import { privateKeyToAccount } from "viem/accounts";
import { loadDeployment } from "../ports/arc-deployment/arc-deployment";
import { loadChainKeys } from "./chain-keys";

const key = `0x${"12".repeat(32)}` as const;
const address = privateKeyToAccount(key).address;
test("keystores decrypt in memory, clear password buffers, and redact both keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "arc-keystore-"));
  const path = join(dir, "throwaway.json");
  const deployment = loadDeployment("testnet");
  if (!deployment) throw new Error("Missing test deployment.");
  const password = "throwaway password";
  writeFileSync(
    path,
    encryptKeystoreJsonSync({ address, privateKey: key }, password, {
      scrypt: { N: 1024, r: 8, p: 1 },
    }),
  );
  const buffers: Buffer[] = [];
  const env = {
    ATTESTER_KEYSTORE: path,
    ATTESTER_KEYCHAIN_SERVICE: "test-only",
    OPS_KEYSTORE: path,
    OPS_KEYCHAIN_SERVICE: "test-only-ops",
  };
  const reader = (service: string) => {
    expect(["test-only", "test-only-ops"]).toContain(service);
    const buffer = Buffer.from(`${password}\n`);
    buffers.push(buffer);
    return buffer;
  };
  try {
    const keys = loadChainKeys(
      env,
      "testnet",
      { ...deployment, ATTESTER: address },
      reader,
    );
    expect(keys.attesterKey?.()).toBe(key);
    expect(keys.opsKey?.()).toBe(key);
    expect(JSON.stringify(keys)).toBe(
      '{"attesterKey":"[REDACTED]","opsKey":"[REDACTED]"}',
    );
    expect(buffers.every((buffer) => buffer.every((byte) => byte === 0))).toBe(
      true,
    );
    expect(() => loadChainKeys(env, "testnet", deployment, reader)).toThrow(
      "does not match deployment ATTESTER",
    );
    expect(() =>
      loadChainKeys(env, "testnet", deployment, () => {
        throw new Error(password);
      }),
    ).toThrow("ATTESTER keystore could not be decrypted.");
    expect(() =>
      loadChainKeys(env, "testnet", deployment, () =>
        Buffer.from("bad password"),
      ),
    ).toThrow("ATTESTER keystore could not be decrypted.");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("public networks require keystores, fork raw alias remains supported", () => {
  const deployment = loadDeployment("testnet");
  if (!deployment) throw new Error("Missing test deployment.");
  const matching = { ...deployment, ATTESTER: address };
  for (const network of ["testnet", "mainnet"] as const) {
    expect(() => loadChainKeys({}, network, matching)).toThrow(
      "ATTESTER_KEYSTORE",
    );
    expect(() =>
      loadChainKeys({ ATTESTER_KEY: key }, network, matching),
    ).toThrow("fork-only");
    expect(() =>
      loadChainKeys({ FORK_ATTESTER_KEY: key }, network, matching),
    ).toThrow("ATTESTER_KEYSTORE");
  }
  expect(
    loadChainKeys({ FORK_ATTESTER_KEY: key }, "fork", matching).attesterKey?.(),
  ).toBe(key);
  expect(() =>
    loadChainKeys({ ATTESTER_KEYSTORE: "unused" }, "fork", matching),
  ).toThrow("supplied together");
});
