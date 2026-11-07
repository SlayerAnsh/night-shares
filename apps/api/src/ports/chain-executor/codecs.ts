import { type Abi, type Address, encodeFunctionData, parseAbi } from "viem";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import type { ChainCommand } from "./chain-executor";
export const usdcAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function mint(address,uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export const permit2Abi = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
]);
export type ContractCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};
export async function commandCall(
  d: ArcDeployment,
  c: ChainCommand,
  tokenOf: (night: `0x${string}`) => Promise<Address>,
): Promise<ContractCall> {
  const call = (
    key: string,
    functionName: string,
    args: readonly unknown[],
    address?: Address,
  ): ContractCall => ({
    address: address ?? d[key as "TradeRouter"],
    abi:
      key === "USDC"
        ? usdcAbi
        : key === "PERMIT2"
          ? permit2Abi
          : (d.abis[key] ?? []),
    functionName,
    args,
  });
  switch (c.kind) {
    case "buy":
      return call("TradeRouter", "buy", [
        c.night,
        c.qty,
        c.maxPaid,
        c.asks,
        c.hints,
        c.deadline,
      ]);
    case "sell":
      return call("TradeRouter", "sell", [
        c.night,
        c.qty,
        c.minReceived,
        c.hints,
        c.deadline,
      ]);
    case "book":
      return call("BookingRouter", "buyAndRedeem", [
        c.night,
        c.maxPrice,
        c.asks,
        c.hints,
        c.deadline,
      ]);
    case "open":
      return call("NightFactory", "openNight", [
        c.propertyId,
        c.roomTypeId,
        c.date,
        c.config,
        c.salt,
      ]);
    case "addChunk":
      return call("NightFactory", "addLadderChunk", [
        c.night,
        c.fromRoom,
        c.toRoom,
      ]);
    case "cancelAll":
      return call("TradeRouter", "cancelAll", []);
    case "sweep":
      return call("NightVault", "sweep", [c.night]);
    case "settleCutoff":
    case "claim":
      return call("Settlement", c.kind, [c.night]);
    case "pushBatch":
      if (c.count < 1n || c.count > 100n)
        throw new Error("pushBatch count must be 1..100.");
      return call("Settlement", "pushBatch", [c.night, c.count]);
    case "withdrawCredit": {
      if (c.contract === "NightToken" && !c.night)
        throw new Error("NightToken credit requires night.");
      return call(
        c.contract,
        "withdrawCredit",
        [c.recipient],
        c.contract === "NightToken"
          ? await tokenOf(c.night as `0x${string}`)
          : undefined,
      );
    }
    case "link":
    case "relink":
      return call(
        "HumanRegistry",
        c.kind === "link" ? "linkWallet" : "relinkWallet",
        [c.humanId, c.wallet, c.deadline, c.signature],
      );
    case "verifyHuman":
      return call("HumanRegistry", "setOrb", [c.humanId, c.orb]);
    case "bind":
      return call("NightFactory", "bindProperty", [
        c.property,
        c.hostPayout,
        c.deadline,
        c.signature,
      ]);
    case "reportWalk":
      return call("Settlement", "reportWalk", [c.report, c.signature]);
    case "transfer":
      return call("USDC", "transfer", [c.to, c.amount]);
    case "approveUsdc":
      return call("USDC", "approve", [d.PERMIT2, c.amount]);
    case "approvePermit2":
      return call("PERMIT2", "approve", [
        d.USDC,
        d[c.router],
        c.amount,
        c.expiration,
      ]);
    case "approveToken":
      return call(
        "NightToken",
        "approve",
        [d.TradeRouter, c.amount],
        await tokenOf(c.night),
      );
    case "provisionToken":
      return call("USDC", "mint", [c.to, c.amount]);
  }
}
export const calldata = (call: ContractCall) => encodeFunctionData(call);
