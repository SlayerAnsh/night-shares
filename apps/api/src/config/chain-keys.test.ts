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
    ATTESTER_KEY: "",
    OPS_KEY: " \t ",
    ATTESTER_KEYSTORE_PASSWORD: " ",
    ATTESTER_KEYSTORE_PASSWORD_FILE: "",
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
test("public networks accept explicit raw keys, fork raw alias remains supported", () => {
  const deployment = loadDeployment("testnet");
  if (!deployment) throw new Error("Missing test deployment.");
  const matching = { ...deployment, ATTESTER: address };
  for (const network of ["testnet", "mainnet"] as const) {
    expect(() => loadChainKeys({}, network, matching)).toThrow(
      "ATTESTER_KEYSTORE",
    );
    expect(
      loadChainKeys(
        { ATTESTER_KEY: key, OPS_KEY: key },
        network,
        matching,
      ).opsKey?.(),
    ).toBe(key);
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

test("password env/file and raw OPS sources work without Keychain; ambiguity fails closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "arc-password-"));
  const path = join(dir, "key.json");
  const file = join(dir, "password");
  writeFileSync(
    path,
    encryptKeystoreJsonSync({ address, privateKey: key }, "test", {
      scrypt: { N: 1024, r: 8, p: 1 },
    }),
  );
  writeFileSync(file, "test\n");
  const noKeychain = () => {
    throw new Error("Keychain must not be used");
  };
  try {
    for (const role of ["ATTESTER", "OPS"]) {
      for (const source of [
        { [`${role}_KEYSTORE_PASSWORD`]: "test" },
        { [`${role}_KEYSTORE_PASSWORD_FILE`]: file },
      ]) {
        const keys = loadChainKeys(
          { [`${role}_KEYSTORE`]: path, ...source },
          "fork",
          undefined,
          noKeychain,
        );
        expect((role === "OPS" ? keys.opsKey : keys.attesterKey)?.()).toBe(key);
        expect(JSON.stringify(keys)).not.toContain(key);
      }
      for (const env of [
        {
          [`${role}_KEY`]: key,
          [`${role}_KEYSTORE`]: path,
          [`${role}_KEYSTORE_PASSWORD`]: "test",
        },
        {
          [`${role}_KEYSTORE`]: path,
          [`${role}_KEYSTORE_PASSWORD`]: "test",
          [`${role}_KEYSTORE_PASSWORD_FILE`]: file,
        },
        {
          [`${role}_KEYSTORE`]: path,
          [`${role}_KEYCHAIN_SERVICE`]: "test",
          [`${role}_KEYSTORE_PASSWORD`]: "test",
        },
      ])
        expect(() => loadChainKeys(env, "fork", undefined, noKeychain)).toThrow(
          "mutually exclusive",
        );
    }
  } finally {
    rmSync(dir, { recursive: true });
  }
});
