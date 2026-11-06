import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Abi, type Address, getAddress, isAddress } from "viem";
import {
  assertOrderDomain,
  type OrderDomain,
} from "../../modules/market/orders/typed-data";

const addressKeys = [
  "TradeRouter",
  "BookingRouter",
  "HumanRegistry",
  "NightFactory",
  "Settlement",
  "NightHook",
  "NightVault",
  "CoverFund",
  "RebatePool",
  "NightToken",
  "USDC",
  "PERMIT2",
  "POOL_MANAGER",
  "ATTESTER",
  "OWNER",
  "PLATFORM",
] as const;
export type ArcDeployment = Record<(typeof addressKeys)[number], Address> & {
  chainId: number;
  EIP712Domain: OrderDomain & { name: string; version: string };
  abis: Record<string, Abi>;
};
export const repoRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);
export function parseDeployment(value: unknown, chainId = 5042): ArcDeployment {
  if (!value || typeof value !== "object")
    throw new Error("Arc deployment must be an object.");
  const data = value as Record<string, unknown>;
  if (data.chainId !== chainId)
    throw new Error(`Arc deployment chainId must equal ${chainId}.`);
  const address = (value: unknown, key: string): Address => {
    if (typeof value !== "string" || !isAddress(value, { strict: true }))
      throw new Error(
        `Arc deployment ${key} must be a valid checksummed address.`,
      );
    return getAddress(value);
  };
  const addresses = Object.fromEntries(
    addressKeys.map((key) => [key, address(data[key], key)]),
  );
  if (!data.abis || typeof data.abis !== "object" || Array.isArray(data.abis))
    throw new Error("Arc deployment abis must be an object.");
  for (const key of ["NightHook", "NightToken", "TradeRouter"]) {
    if (!Array.isArray((data.abis as Record<string, unknown>)[key]))
      throw new Error(`Arc deployment abis.${key} is required.`);
  }
  for (const [name, abi] of Object.entries(data.abis)) {
    if (
      !Array.isArray(abi) ||
      abi.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          typeof item.type !== "string" ||
          (item.type === "function" &&
            (typeof item.name !== "string" ||
              !Array.isArray(item.inputs) ||
              !Array.isArray(item.outputs))),
      )
    )
      throw new Error(`Arc deployment abis.${name} is malformed.`);
  }
  const domain = data.EIP712Domain as ArcDeployment["EIP712Domain"] | undefined;
  if (
    !domain ||
    typeof domain.name !== "string" ||
    typeof domain.version !== "string"
  )
    throw new Error("Arc deployment EIP712Domain is required.");
  const normalized = {
    ...domain,
    verifyingContract: address(
      domain.verifyingContract,
      "EIP712Domain.verifyingContract",
    ),
  };
  assertOrderDomain(
    { chainId, verifyingContract: addresses.TradeRouter as Address },
    normalized,
  );
  return {
    ...addresses,
    chainId,
    abis: data.abis,
    EIP712Domain: normalized,
  } as ArcDeployment;
}
export function loadDeployment(
  network: "mainnet" | "testnet" | "fork",
  file?: string,
): ArcDeployment | undefined {
  if (network === "testnet" && !file) return undefined;
  const path = resolve(
    repoRoot,
    file ??
      `packages/contracts/deployments/${network === "fork" ? "5042-fork" : "5042"}.json`,
  );
  if (!existsSync(path)) {
    if (network !== "fork" && !file) return undefined;
    throw new Error(
      `ARC_DEPLOYMENT_FILE missing: ${path}. Deploy contracts before starting the API.`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`ARC_DEPLOYMENT_FILE cannot be read as JSON: ${path}.`);
  }
  return parseDeployment(value, network === "testnet" ? 5042002 : 5042);
}
