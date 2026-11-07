import { createHash } from "node:crypto";
import {
  type Address,
  createPublicClient,
  defineChain,
  hashDomain,
  zeroAddress,
} from "viem";
import { serialize } from "../chain-executor/chain-executor";
import { authorizationAbi } from "../chain-executor/x402-codecs";
import type { ArcDeployment } from "./arc-deployment";
import { assertLocalForkRpc } from "./local-fork";
import { legacyRequiredAbi, requiredAbi } from "./required-abi";
import { arcTransport } from "./transport";
export const arcChain = (rpcUrl: string, chainId = 5042) =>
  defineChain({
    id: chainId,
    name: "Arc",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
export const forkChain = arcChain;
export const chainClient = (urls: string[], chainId: number) =>
  createPublicClient({
    chain: arcChain(urls[0] as string, chainId),
    transport: arcTransport(urls),
  });
export const forkClient = (rpcUrl: string) => {
  assertLocalForkRpc(rpcUrl);
  return chainClient([rpcUrl], 5042);
};
export type ForkClient = ReturnType<typeof chainClient>;
export const digest = (value: unknown) =>
  createHash("sha256").update(serialize(value)).digest("hex");
export function validateExecutionAbi(d: ArcDeployment): void {
  for (const [contract, signatures] of Object.entries(
    d.x402Available ? requiredAbi : legacyRequiredAbi,
  )) {
    const actual = d.abis[contract];
    for (const signature of signatures) {
      if (!actual?.some((item) => JSON.stringify(item) === signature))
        throw new Error(`Arc deployment ABI mismatch: ${contract}.`);
    }
  }
}

export async function validateDeployment(
  d: ArcDeployment,
  client: ForkClient,
  _warn: (message: string) => void = console.warn,
): Promise<string> {
  let check = "ABI";
  try {
    validateExecutionAbi(d);
    if (d.x402Available && !d.USDC_EIP712)
      throw new Error("Missing USDC_EIP712 domain.");
    check = "chainId";
    if ((await client.getChainId()) !== d.chainId)
      throw new Error("Arc RPC chainId must match deployment.");
    check = "block";
    if (!Number.isSafeInteger(d.block) || (d.block ?? -1) < 0)
      throw new Error("Deployment block is required.");
    const block = await client.getBlock({
      blockNumber: BigInt(d.block as number),
    });
    const addresses = Object.entries(d).filter(
      ([key, value]) =>
        typeof value === "string" &&
        value !== zeroAddress &&
        /^0x[0-9a-fA-F]{40}$/.test(value) &&
        !["ATTESTER", "OWNER", "PLATFORM"].includes(key),
    );
    for (const [name, address] of addresses) {
      check = `code ${name} ${address}`;
      const code = await client.getCode({ address: address as Address });
      if (!code || code === "0x")
        throw new Error(`Deployment code missing: ${name}.`);
    }
    const wiring: Record<string, keyof ArcDeployment> = {
      factory: "NightFactory",
      tokenDeployer: "NightTokenDeployer",
      settler: "X402Settler",
      poolManager: "POOL_MANAGER",
      manager: "POOL_MANAGER",
      usdc: "USDC",
      permit2: "PERMIT2",
      registry: "HumanRegistry",
      hook: "NightHook",
      vault: "NightVault",
      tradeRouter: "TradeRouter",
      bookingRouter: "BookingRouter",
      settlement: "Settlement",
      coverFund: "CoverFund",
      rebatePool: "RebatePool",
      platform: "PLATFORM",
      attester: "ATTESTER",
      owner: "OWNER",
    };
    for (const [contract, abi] of Object.entries(d.abis)) {
      if (!(contract in d) || d[contract as "NightToken"] === zeroAddress)
        continue;
      for (const item of abi) {
        if (
          item.type !== "function" ||
          item.inputs.length ||
          !(item.name in wiring)
        )
          continue;
        const expected = d[wiring[item.name] as keyof ArcDeployment];
        check = `dependency ${contract}.${item.name} ${d[contract as "TradeRouter"]}`;
        const actual = await client.readContract({
          address: d[contract as "TradeRouter"],
          abi,
          functionName: item.name,
        });
        if (String(actual).toLowerCase() !== String(expected).toLowerCase())
          throw new Error(
            `Deployment dependency mismatch: ${contract}.${item.name}.`,
          );
      }
    }
    check = `dependency NightFactory.dependencies ${d.NightFactory}`;
    const dependencies = (await client.readContract({
      address: d.NightFactory,
      abi: d.abis.NightFactory ?? [],
      functionName: "dependencies",
    })) as Record<string, Address>;
    if (
      d.x402Available &&
      dependencies.settler?.toLowerCase() !== d.X402Settler?.toLowerCase()
    )
      throw new Error("Factory dependency mismatch: settler.");
    for (const [name, actual] of Object.entries(dependencies)) {
      const key = wiring[name];
      if (!key || String(d[key]).toLowerCase() !== actual.toLowerCase())
        throw new Error(`Factory dependency mismatch: ${name}.`);
    }
    for (const name of [
      "TradeRouter",
      "HumanRegistry",
      "NightFactory",
      "Settlement",
      ...(d.x402Available ? (["USDC"] as const) : []),
    ] as const) {
      const address = d[name];
      check = `domain ${name} ${address}`;
      const actual = await client.readContract({
        address,
        abi: name === "USDC" ? authorizationAbi : (d.abis[name] ?? []),
        functionName: "DOMAIN_SEPARATOR",
      });
      const expected = hashDomain({
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
        },
        domain: {
          name:
            name === "USDC" ? (d.USDC_EIP712?.name ?? "USDC") : "NightShares",
          version: name === "USDC" ? (d.USDC_EIP712?.version ?? "2") : "1",
          chainId: BigInt(d.chainId),
          verifyingContract: address,
        },
      });
      if (actual !== expected)
        throw new Error(`Deployment domain mismatch: ${name}.`);
    }
    return digest({
      chainId: d.chainId,
      addresses,
      block: d.block,
      hash: block.hash,
      abis: d.abis,
    });
  } catch (error) {
    const reason =
      error instanceof Error
        ? "shortMessage" in error
          ? String(error.shortMessage)
          : error.message
        : String(error);
    throw new Error(`${check}: ${reason}`, { cause: error });
  }
}
