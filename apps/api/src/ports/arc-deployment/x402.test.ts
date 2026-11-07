import { expect, test } from "bun:test";
import { hashDomain, zeroAddress } from "viem";
import { parseDeployment } from "./arc-deployment";
import { executionFixture, fixture } from "./fixture";
import { requiredAbi } from "./required-abi";
import {
  type ForkClient,
  validateDeployment,
  validateExecutionAbi,
} from "./validate";

test("x402 deployment requires addresses and USDC domain; legacy testnet remains available", () => {
  for (const key of ["X402Settler", "NightTokenDeployer", "USDC_EIP712"]) {
    expect(() => parseDeployment({ ...fixture(), [key]: undefined })).toThrow(
      key,
    );
  }
  const raw = fixture();
  const legacy = parseDeployment(
    {
      ...raw,
      chainId: 5042002,
      EIP712Domain: { ...raw.EIP712Domain, chainId: 5042002 },
      X402Settler: undefined,
      NightTokenDeployer: undefined,
      USDC_EIP712: undefined,
    },
    5042002,
  );
  expect(legacy?.x402Available).toBe(false);
  expect(legacy?.X402Settler).toBeUndefined();
  const current = executionFixture();
  expect(current?.x402Available).toBe(true);
});

const deployment = executionFixture;

const wiring = {
  factory: "NightFactory",
  tokenDeployer: "NightTokenDeployer",
  settler: "X402Settler",
  poolManager: "POOL_MANAGER",
  manager: "POOL_MANAGER",
  usdc: "USDC",
  permit2: "PERMIT2",
  vault: "NightVault",
  hook: "NightHook",
  bookingRouter: "BookingRouter",
  tradeRouter: "TradeRouter",
  settlement: "Settlement",
  coverFund: "CoverFund",
  rebatePool: "RebatePool",
  registry: "HumanRegistry",
  platform: "PLATFORM",
  owner: "OWNER",
  attester: "ATTESTER",
} as const;

function clientFor(d: ReturnType<typeof deployment>, broken = "") {
  return {
    getChainId: async () => 5042,
    getBlock: async () => ({ hash: "0x1234" }),
    getCode: async () => "0x01",
    readContract: async ({
      address,
      functionName,
    }: {
      address: string;
      functionName: string;
    }) => {
      const contract = Object.entries(d).find(
        ([, value]) => value === address,
      )?.[0];
      if (`${contract}.${functionName}` === broken) return zeroAddress;
      if (functionName === "dependencies")
        return Object.fromEntries(
          Object.entries(wiring)
            .filter(
              ([name]) =>
                ![
                  "factory",
                  "tokenDeployer",
                  "manager",
                  "owner",
                  "attester",
                ].includes(name),
            )
            .map(([name, key]) => [
              name,
              broken === `dependencies.${name}` ? zeroAddress : d[key],
            ]),
        );
      if (functionName === "tokenOf") return d.NightToken;
      if (functionName === "DOMAIN_SEPARATOR")
        return hashDomain({
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
              contract === "USDC"
                ? "USDC"
                : contract === "NightToken"
                  ? "NightShares Room Night"
                  : "NightShares",
            version: contract === "USDC" ? "2" : "1",
            chainId: 5042n,
            verifyingContract: address as `0x${string}`,
          },
        });
      return d[wiring[functionName as keyof typeof wiring]];
    },
  } as unknown as ForkClient;
}

test("x402 startup fails on settler, deployer wiring and either authorization domain mismatch", async () => {
  const d = deployment();
  await expect(validateDeployment(d, clientFor(d))).resolves.toMatch(
    /^[a-f0-9]{64}$/,
  );
  for (const broken of [
    "dependencies.settler",
    "NightFactory.tokenDeployer",
    "NightTokenDeployer.factory",
    "NightToken.factory",
    "X402Settler.factory",
    "X402Settler.tradeRouter",
    "X402Settler.usdc",
    "TradeRouter.settler",
    "USDC.DOMAIN_SEPARATOR",
    "NightToken.DOMAIN_SEPARATOR",
  ]) {
    await expect(validateDeployment(d, clientFor(d, broken))).rejects.toThrow(
      "mismatch",
    );
  }
});

test("required x402 functions, events, errors and dependencies are pinned", () => {
  const d = deployment();
  validateExecutionAbi(d);
  for (const contract of [
    "NightFactory",
    "TradeRouter",
    "NightToken",
    "X402Settler",
    "NightTokenDeployer",
  ]) {
    for (const entry of requiredAbi[contract] ?? []) {
      const changed = {
        ...d,
        abis: {
          ...d.abis,
          [contract]:
            d.abis[contract]?.filter(
              (item) => JSON.stringify(item) !== entry,
            ) ?? [],
        },
      };
      expect(() => validateExecutionAbi(changed)).toThrow(contract);
    }
  }
});

test("missing NightToken defers once or validates the factory demo token", async () => {
  const original = deployment();
  const d = { ...original, NightToken: zeroAddress };
  const warnings: string[] = [];
  const client = clientFor(original);
  const warn = (message: string) => {
    warnings.push(message);
  };
  await validateDeployment(d, client, warn);
  await validateDeployment(d, client, warn);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("deferred");
  d.demoNight = `0x${"ab".repeat(32)}`;
  await expect(validateDeployment(d, client, warn)).resolves.toMatch(
    /^[a-f0-9]{64}$/,
  );
  await expect(
    validateDeployment(
      d,
      clientFor(original, "NightToken.DOMAIN_SEPARATOR"),
      warn,
    ),
  ).rejects.toThrow("domain NightToken");
  expect(warnings).toHaveLength(1);
});

test("preflight includes failing check and redacts endpoint secrets", async () => {
  const { runPreflight } = await import("../../container/chain-preflight");
  const d = deployment();
  const client = clientFor(d);
  const read = client.readContract;
  const secret = "preflight-secret-123456789";
  const url = `https://rpc.invalid/v2/${secret}`;
  client.readContract = (async (args: Parameters<typeof read>[0]) => {
    if (
      args.address === d.NightToken &&
      args.functionName === "DOMAIN_SEPARATOR"
    )
      throw new Error(
        `The contract function "DOMAIN_SEPARATOR" returned no data.\n${url} ${secret}`,
      );
    return read(args);
  }) as typeof read;
  let reason = "";
  try {
    await runPreflight(
      { deployment: d, rpcUrls: [url], chainId: d.chainId },
      client,
    );
  } catch (error) {
    reason = (error as Error).message;
  }
  expect(reason).toContain(`domain NightToken ${d.NightToken}`);
  expect(reason).toContain("returned no data");
  expect(reason).not.toContain(secret);
  expect(reason).not.toContain("\n");
});
