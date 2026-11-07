import { type Abi, getAddress } from "viem";
import { parseDeployment } from "./arc-deployment";
import { requiredAbi } from "./required-abi";
export function fixture() {
  const address = getAddress(`0x${"ab".repeat(20)}`);
  const keys = [
    "X402Settler",
    "NightTokenDeployer",
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
  ];
  return {
    ...Object.fromEntries(keys.map((key) => [key, address])),
    USDC_EIP712: { name: "USDC", version: "2" },
    chainId: 5042,
    abis: { NightHook: [], NightToken: [], TradeRouter: [] },
    EIP712Domain: {
      name: "NightShares",
      version: "1",
      chainId: 5042,
      verifyingContract: address,
    },
  };
}

export function executionFixture() {
  const data = fixture();
  const addresses = Object.fromEntries(
    Object.keys(data)
      .filter((key) => typeof data[key as keyof typeof data] === "string")
      .map((key, index) => [
        key,
        getAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`),
      ]),
  );
  return parseDeployment({
    ...data,
    ...addresses,
    block: 1,
    EIP712Domain: {
      ...data.EIP712Domain,
      verifyingContract: addresses.TradeRouter,
    },
    abis: Object.fromEntries(
      Object.entries(requiredAbi).map(([name, entries]) => [
        name,
        entries.map((entry) => JSON.parse(entry)) as Abi,
      ]),
    ),
  });
}
