import type { Address, Hex } from "viem";
import type { NightConfig } from "../chain-executor/chain-executor";
import type { ChainReader, Snapshot } from "./chain-reader";
export type PositionSnapshot = {
  token: Address;
  balance: bigint;
  cachedHuman: bigint;
  humanBalance: bigint;
  inList: boolean;
  recallCredit: bigint;
  hookCredit: bigint;
  settlementCredit: bigint;
  claimable: bigint;
  claimed: boolean;
};
export type NightSnapshot = {
  config: NightConfig;
  token: Address;
  ladderComplete: boolean;
  nextRoom: bigint;
  burned: bigint;
  held: bigint;
  cutoffSettled: boolean;
  refundPerNight: bigint;
  remainingReserve: bigint;
  remainingHeld: bigint;
  cursor: Address;
};
export async function positionSnapshot(
  reader: ChainReader,
  night: Hex,
  wallet: Address,
): Promise<Snapshot<PositionSnapshot>> {
  const block = await reader.head();
  const token = await reader.tokenOf(night, block.number);
  const get = async <T>(
    contract: string,
    functionName: string,
    args: readonly unknown[],
  ): Promise<T> =>
    (
      await reader.read<T>(
        { contract, functionName, args, night },
        block.number,
      )
    ).value;
  const cachedHuman = await get<bigint>("NightToken", "cachedHuman", [wallet]);
  const [
    balance,
    humanBalance,
    inList,
    recallCredit,
    hookCredit,
    settlementCredit,
    claimable,
    claimed,
  ] = await Promise.all([
    get<bigint>("NightToken", "balanceOf", [wallet]),
    get<bigint>("NightToken", "humanBalance", [cachedHuman]),
    get<boolean>("NightToken", "inList", [wallet]),
    get<bigint>("NightToken", "credits", [wallet]),
    get<bigint>("NightHook", "credits", [wallet]),
    get<bigint>("Settlement", "credits", [wallet]),
    get<bigint>("Settlement", "claimable", [night, wallet]),
    get<boolean>("Settlement", "claimed", [night, wallet]),
  ]);
  return {
    block,
    value: {
      token,
      balance,
      cachedHuman,
      humanBalance,
      inList,
      recallCredit,
      hookCredit,
      settlementCredit,
      claimable,
      claimed,
    },
  };
}
export async function nightSnapshot(
  reader: ChainReader,
  night: Hex,
): Promise<Snapshot<NightSnapshot>> {
  const block = await reader.head();
  const get = async <T>(
    contract: string,
    functionName: string,
    args: readonly unknown[],
  ): Promise<T> =>
    (
      await reader.read<T>(
        { contract, functionName, args, night },
        block.number,
      )
    ).value;
  const [
    config,
    token,
    ladderComplete,
    nextRoom,
    burned,
    held,
    cutoffSettled,
    refundPerNight,
    remainingReserve,
    remainingHeld,
    cursor,
  ] = await Promise.all([
    get<NightConfig>("NightFactory", "config", [night]),
    reader.tokenOf(night, block.number),
    get<boolean>("NightFactory", "ladderComplete", [night]),
    get<bigint>("NightVault", "nextRoom", [night]),
    get<bigint>("NightToken", "burned", []),
    get<bigint>("NightToken", "held", []),
    get<boolean>("Settlement", "cutoffSettled", [night]),
    get<bigint>("Settlement", "refundPerNight", [night]),
    get<bigint>("Settlement", "remainingReserve", [night]),
    get<bigint>("Settlement", "remainingHeld", [night]),
    get<Address>("Settlement", "cursor", [night]),
  ]);
  return {
    block,
    value: {
      config,
      token,
      ladderComplete,
      nextRoom,
      burned,
      held,
      cutoffSettled,
      refundPerNight,
      remainingReserve,
      remainingHeld,
      cursor,
    },
  };
}
export async function allowanceSnapshot(
  reader: ChainReader,
  owner: Address,
  token: Address,
  permit2: Address,
  router: Address,
): Promise<
  Snapshot<{
    erc20: bigint;
    permit2: bigint;
    expiration: number;
    nonce: number;
  }>
> {
  const block = await reader.head();
  const erc20 = (
    await reader.read<bigint>(
      { contract: "USDC", functionName: "allowance", args: [owner, permit2] },
      block.number,
    )
  ).value;
  const [amount, expiration, nonce] = (
    await reader.read<readonly [bigint, number, number]>(
      {
        contract: "PERMIT2",
        functionName: "allowance",
        args: [owner, token, router],
      },
      block.number,
    )
  ).value;
  return { block, value: { erc20, permit2: amount, expiration, nonce } };
}
