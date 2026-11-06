import { getAddress } from "viem";
export function fixture() {
  const address = getAddress(`0x${"ab".repeat(20)}`);
  const keys = [
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
