import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { decryptKeystoreJsonSync } from "ethers";
import { type Hex, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ArcDeployment } from "../ports/arc-deployment/arc-deployment";

type Env = Record<string, string | undefined>;
type Secret = (() => Hex) & { toJSON(): string };
const secret = (key: Hex): Secret =>
  Object.assign(() => key, { toJSON: () => "[REDACTED]" });

export function readKeychainPassword(service: string): Buffer {
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", service, "-w"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10000,
      },
    );
  } catch {
    throw new Error("Keychain password could not be read.");
  }
}

export function loadChainKeys(
  env: Env,
  network: "fork" | "testnet" | "mainnet" | undefined,
  deployment?: ArcDeployment,
  passwordReader = readKeychainPassword,
): { attesterKey?: Secret; opsKey?: Secret } {
  if (!network) return {};
  function load(role: "ATTESTER" | "OPS"): Secret | undefined {
    const path = env[`${role}_KEYSTORE`];
    const service = env[`${role}_KEYCHAIN_SERVICE`];
    let raw =
      role === "ATTESTER"
        ? (env.ATTESTER_KEY ??
          (network === "fork" ? env.FORK_ATTESTER_KEY : undefined))
        : undefined;
    if (raw && network !== "fork") {
      // Validate the public address first so a wrong startup credential has a
      // useful diagnostic; matching raw credentials are still refused off-fork.
      if (role === "ATTESTER" && deployment) checkAttester(raw, deployment);
      throw new Error(
        "Raw ATTESTER_KEY is fork-only; use ATTESTER_KEYSTORE and ATTESTER_KEYCHAIN_SERVICE.",
      );
    }
    if (raw && (path || service))
      throw new Error(`${role} key sources are mutually exclusive.`);
    if (!!path !== !!service)
      throw new Error(
        `${role}_KEYSTORE and ${role}_KEYCHAIN_SERVICE must be supplied together.`,
      );
    if (path && service) {
      let password: Buffer | undefined;
      let json: string | undefined;
      try {
        password = passwordReader(service);
        // security appends one newline. Preserve all other password characters.
        const end =
          password[password.length - 1] === 10
            ? password.length - 1
            : password.length;
        json = readFileSync(
          path.startsWith("~/") ? join(homedir(), path.slice(2)) : path,
          "utf8",
        );
        raw = decryptKeystoreJsonSync(
          json,
          password.subarray(0, end),
        ).privateKey;
      } catch {
        throw new Error(`${role} keystore could not be decrypted.`);
      } finally {
        password?.fill(0);
        password = undefined;
        json = undefined;
      }
    }
    if (!raw) return undefined;
    try {
      if (!isHex(raw) || !/^0x[0-9a-fA-F]{64}$/.test(raw)) throw new Error();
      privateKeyToAccount(raw);
    } catch {
      throw new Error(`${role}_KEY must be a valid 32-byte private key.`);
    }
    const value = secret(raw as Hex);
    raw = undefined;
    return value;
  }
  const attesterKey = load("ATTESTER");
  if (!attesterKey && network !== "fork")
    throw new Error(
      "ATTESTER_KEYSTORE and ATTESTER_KEYCHAIN_SERVICE are required for chain startup.",
    );
  if (attesterKey && deployment) checkAttester(attesterKey(), deployment);
  return { attesterKey, opsKey: load("OPS") };
}
function checkAttester(key: string, deployment: ArcDeployment) {
  let address: string;
  try {
    address = privateKeyToAccount(key as Hex).address;
  } catch {
    throw new Error("ATTESTER_KEY must be a valid 32-byte private key.");
  }
  if (address.toLowerCase() !== deployment.ATTESTER.toLowerCase())
    throw new Error("ATTESTER_KEY does not match deployment ATTESTER.");
}
